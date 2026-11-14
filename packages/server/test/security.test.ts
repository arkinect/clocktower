import { readFileSync, readdirSync } from 'node:fs';
import { connect as dialTcp } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@ct/protocol';
import { ENGINE_VERSION } from '@ct/rules';
import { cookieHeader, SESSION_SECONDS, SESSIONS_PER_PLAYER, Sessions } from '../src/auth/sessions';
import { assertSafe, DEFAULT_LIMITS, loadConfig, StartupRefused } from '../src/config';
import { LiveGame } from '../src/games/manager';
import { Store } from '../src/store/store';
import { originAllowed } from '../src/ws/hub';
import { BucketMap, PasswordBackoff, TokenBucket, clientIp } from '../src/limits/limits';
import { Client, connect, dial, join, open, start, table, testConfig, tokenOf, type Harness } from './helpers/client';

const opened: Harness[] = [];
const up = async (config = testConfig()) => {
  const h = await start(config);
  opened.push(h);
  return h;
};

afterEach(async () => {
  for (const h of opened.splice(0)) await h.app.close();
  vi.restoreAllMocks();
});

const post = (h: Harness, url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${h.base}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('tokens', () => {
  it('never appear in a view, an export, a log or the database', async () => {
    const h = await up();
    const { st, players } = await table(h);
    await st.do({ type: 'begin_first_night', force: true });
    const ann = players[0] as Client;
    await ann.until((v) => v.phase.kind === 'night');
    const token = decodeURIComponent(ann.cookie.split('=')[1] as string);
    expect(token.length).toBeGreaterThanOrEqual(43);
    const exported = await (await fetch(`${h.base}/api/g/default/export`, { headers: { cookie: st.cookie } })).text();
    for (const c of [st, ...players]) expect(c.raw.join('')).not.toContain(token);
    expect(exported).not.toContain(token);
    expect(h.logs.join('')).not.toContain(token);
    await h.app.close();
    opened.pop();
    const db = readdirSync(h.dir).map((f) => readFileSync(path.join(h.dir, f)).toString('latin1'));
    expect(db.join('')).not.toContain(token);
  });

  it('are HttpOnly, SameSite=Strict, and Secure over https', async () => {
    const h = await up(testConfig({ secureCookies: true }));
    const { cookie } = await join(h, 'Ann');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(tokenOf(cookie).length).toBeGreaterThanOrEqual(43);
  });

  it('logs carry the player id and command type, not arguments', async () => {
    const h = await up();
    await join(h, 'Unmistakable Name');
    const log = h.logs.filter((l) => l.includes('"command"')).join('');
    expect(log).toContain('"command":"join"');
    expect(log).not.toContain('Unmistakable');
    expect(log).not.toContain('127.0.0.1');
  });

  it('rejoin issues a new session', async () => {
    const h = await up();
    const j = await join(h, 'Ann');
    const res = await post(h, '/api/g/default/rejoin', { playerId: j.body.playerId });
    const again = res.headers.get('set-cookie');
    expect(res.status).toBe(200);
    expect(tokenOf(again)).toBeTruthy();
    expect(tokenOf(again)).not.toBe(tokenOf(j.cookie));
  });
});

describe('sessions', () => {
  const life = SESSION_SECONDS * 1000;

  it('one player keeps only the newest few, however often they rejoin', () => {
    const store = new Store(':memory:');
    const sessions = new Sessions(store, 0);
    const tokens = Array.from({ length: SESSIONS_PER_PLAYER + 2 }, (_, i) => sessions.issue('g', 'ann', i));
    const other = sessions.issue('g', 'bo', 0);
    expect(store.sessions()).toHaveLength(SESSIONS_PER_PLAYER + 1);
    expect(sessions.find(tokens[0] as string, 100)).toBeNull();
    expect(sessions.find(tokens[1] as string, 100)).toBeNull();
    expect(sessions.find(tokens[2] as string, 100)?.playerId).toBe('ann');
    expect(sessions.find(tokens.at(-1) as string, 100)?.playerId).toBe('ann');
    expect(sessions.find(other, 100)?.playerId).toBe('bo');
    store.close();
  });

  it('end when their cookie does', () => {
    const store = new Store(':memory:');
    const sessions = new Sessions(store, 0);
    const token = sessions.issue('g', 'ann', 0);
    expect(cookieHeader(token, false)).toContain(`Max-Age=${SESSION_SECONDS}`);
    expect(sessions.find(token, life)?.playerId).toBe('ann');
    expect(sessions.find(token, life + 1)).toBeNull();
    expect(store.sessions()).toEqual([]);
    store.close();
  });

  it('are cleared out at startup once they have ended', () => {
    const store = new Store(':memory:');
    const before = new Sessions(store, 0);
    before.issue('g', 'ann', 0);
    const kept = before.issue('g', 'bo', life);
    const after = new Sessions(store, life + 1);
    expect(store.sessions().map((s) => s.playerId)).toEqual(['bo']);
    expect(after.find(kept, life + 1)?.playerId).toBe('bo');
    store.close();
  });
});

describe('Strict-Transport-Security', () => {
  const header = async (config = testConfig()) => {
    const h = await up(config);
    return (await fetch(`${h.base}/healthz`)).headers.get('strict-transport-security');
  };

  it('is absent by default, even behind HTTPS', async () => {
    expect(await header()).toBeNull();
    expect(await header(testConfig({ secureCookies: true }))).toBeNull();
    expect(loadConfig({}).hsts).toBe(false);
    expect(loadConfig({ HSTS: '0' }).hsts).toBe(false);
  });

  it('is sent only when HSTS turns it on, and never for subdomains', async () => {
    expect(loadConfig({ HSTS: '1' }).hsts).toBe(true);
    expect(loadConfig({ HSTS: 'true' }).hsts).toBe(true);
    expect(await header(testConfig({ hsts: true }))).toBe('max-age=15552000');
  });
});

describe('sockets', () => {
  it('reject a wrong or missing Origin', async () => {
    const h = await up();
    const { cookie } = await connect(h, 'Ann');
    await expect(open(h, { origin: 'http://evil.example', cookie })).rejects.toThrow('403');
    await expect(open(h, { cookie })).rejects.toThrow('403');
    expect(originAllowed('https://a.example', 'x', ['https://a.example'])).toBe(true);
    expect(originAllowed('https://b.example', 'b.example', ['https://a.example'])).toBe(false);
    expect(originAllowed('not a url', 'x', [])).toBe(false);
  });

  it('reject a missing or forged session', async () => {
    const h = await up();
    await expect(open(h, { origin: h.base })).rejects.toThrow('401');
    await expect(open(h, { origin: h.base, cookie: 'ct_session=forged' })).rejects.toThrow('401');
  });

  it('are capped per session and per address', async () => {
    const h = await up(testConfig({}, { socketsPerIp: 4 }));
    const a = await connect(h, 'Ann');
    const extra = [
      await open(h, { origin: h.base, cookie: a.cookie }),
      await open(h, { origin: h.base, cookie: a.cookie }),
    ];
    await expect(open(h, { origin: h.base, cookie: a.cookie })).rejects.toThrow('429');
    await connect(h, 'Bo');
    const cy = await join(h, 'Cy');
    await expect(open(h, { origin: h.base, cookie: (cy.cookie as string).split(';')[0] as string })).rejects.toThrow(
      '429',
    );
    extra[0]?.terminate();
    await vi.waitFor(() => expect(h.app.hub.socketCount()).toBe(3));
    await open(h, { origin: h.base, cookie: (cy.cookie as string).split(';')[0] as string });
  });

  it('do not lose a slot to an aborted handshake', async () => {
    const h = await up(testConfig({}, { socketsPerIp: 2, socketsPerSession: 2 }));
    const { ws, cookie } = await connect(h, 'Ann');
    ws.terminate();
    await vi.waitFor(() => expect(h.app.hub.socketCount()).toBe(0));

    // Each is accepted by every check of ours, then aborted by ws for having no key, or by the client going away.
    const aborted = (lines: string[], hangUp: boolean) =>
      new Promise<void>((resolve) => {
        const raw = dialTcp(Number(h.host.split(':')[1]), '127.0.0.1', () => {
          raw.write([...lines, '', ''].join('\r\n'));
          if (hangUp) raw.destroy();
        });
        raw.resume();
        raw.on('close', () => resolve());
        raw.on('error', () => resolve());
      });
    const start = [
      'GET /ws HTTP/1.1',
      `Host: ${h.host}`,
      `Origin: ${h.base}`,
      `Cookie: ${cookie}`,
      'Connection: Upgrade',
      'Upgrade: websocket',
    ];
    for (let i = 0; i < 5; i++)
      await aborted(['GET /ws HTTP/1.1', ...start.slice(1), 'Sec-WebSocket-Version: 13'], false);
    const full = [...start, 'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=='];
    for (let i = 0; i < 5; i++) await aborted(full, true);

    await vi.waitFor(() => expect(h.app.hub.socketCount()).toBe(0));
    const sockets = [await open(h, { origin: h.base, cookie }), await open(h, { origin: h.base, cookie })];
    expect(sockets.every((x) => x.readyState === x.OPEN)).toBe(true);
    expect(h.app.hub.socketCount()).toBe(2);
  });

  it('let 30 sessions on one address connect, as a table sharing one connection does', async () => {
    expect(DEFAULT_LIMITS.socketsPerIp).toBe(200);
    expect(DEFAULT_LIMITS.playersPerGame).toBe(30);
    const h = await up();
    const names = Array.from({ length: 30 }, (_, i) => `Player ${i + 1}`);
    const clients = await Promise.all(names.map((name) => connect(h, name)));
    expect(clients).toHaveLength(30);
    expect(h.app.hub.socketCount()).toBe(30);
  });

  it('drop an oversized frame', async () => {
    const h = await up();
    const a = await connect(h, 'Ann');
    const closed = new Promise<number>((r) => a.ws.once('close', r));
    a.ws.send('x'.repeat(DEFAULT_LIMITS.socketMaxPayload + 1));
    expect(await closed).toBe(1009);
  });

  it('ignore messages beyond the rate limit', async () => {
    const h = await up(testConfig({}, { socketBurst: 3, socketMessagesPerSecond: 1 }));
    const a = await connect(h, 'Ann');
    for (let i = 0; i < 10; i++) a.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(a.raw.filter((m) => m.includes('"pong"'))).toHaveLength(3);
  });

  it('tell a stale phone to reload', async () => {
    const h = await up();
    const a = await connect(h, 'Ann');
    a.ws.send(JSON.stringify({ v: 999, type: 'ping' }));
    a.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', buildId: 'old' }));
    await vi.waitFor(() => expect(a.raw.filter((m) => m.includes('"reload"'))).toHaveLength(2));
  });

  it('refuse join over a socket, Storyteller commands from players, and malformed commands', async () => {
    const h = await up();
    await connect(h, 'Storyteller', { wantsStoryteller: true });
    const a = await connect(h, 'Ann');
    const join = await a.send({
      type: 'join',
      id: a.id as never,
      name: 'x',
      rolePreference: 'none',
      wantsStoryteller: true,
    });
    expect(join.ok).toBe(false);
    expect((await a.send({ type: 'open_setup' })).ok).toBe(false);
    a.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'command', requestId: 'bad', command: { type: 'nope' } }));
    await vi.waitFor(() =>
      expect(a.raw.some((m) => m.includes('"requestId":"bad"') && m.includes('Bad request'))).toBe(true),
    );
  });

  it('bound the queue of a game', async () => {
    const h = await up();
    const game = h.app.games.get('default') as LiveGame;
    const many = Array.from({ length: 40 }, () => game.submit(null, { type: 'open_setup' }));
    const results = await Promise.all(many);
    expect(results.filter((r) => !r.ok && r.error.includes('busy'))).toHaveLength(8);
  });
});

describe('addresses and limits', () => {
  it('believe X-Forwarded-For only from the configured proxy', () => {
    expect(clientIp('::ffff:9.9.9.9', '1.2.3.4', ['172.18.0.2'])).toBe('9.9.9.9');
    expect(clientIp('::ffff:172.18.0.2', '1.2.3.4', ['172.18.0.2'])).toBe('1.2.3.4');
    expect(clientIp('172.18.0.2', undefined, ['172.18.0.2'])).toBe('172.18.0.2');
  });

  it('ignores a spoofed header from a peer that is not Caddy', async () => {
    const h = await up(testConfig({}, { unauthBurstPerIp: 3, unauthRatePerIp: 0.001 }));
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push(
        (await fetch(`${h.base}/api/g/default/names`, { headers: { 'x-forwarded-for': `1.2.3.${i}` } })).status,
      );
    }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('honours the header from Caddy', async () => {
    const h = await up(testConfig({ trustedProxies: ['127.0.0.1'] }, { unauthBurstPerIp: 1, unauthRatePerIp: 0.001 }));
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${h.base}/api/g/default/names`, { headers: { 'x-forwarded-for': `1.2.3.${i}` } });
      expect(res.status).toBe(200);
    }
  });

  it('a valid session bypasses abuse limits', async () => {
    const h = await up(testConfig({}, { unauthBurstPerIp: 1, unauthRatePerIp: 0.001 }));
    const { cookie } = await join(h, 'Ann');
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${h.base}/api/g/default/names`, {
        headers: { cookie: (cookie as string).split(';')[0] as string },
      });
      expect(res.status).toBe(200);
    }
  });

  it('a global bucket catches many addresses at once', async () => {
    const h = await up(testConfig({ trustedProxies: ['127.0.0.1'] }, { unauthBurst: 2, unauthRate: 0.001 }));
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (await fetch(`${h.base}/api/g/default/names`, { headers: { 'x-forwarded-for': `1.2.3.${i}` } })).status,
      );
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it('buckets refill and forget idle keys', () => {
    const b = new TokenBucket(1, 2, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(1000)]).toEqual([true, true, false, true]);
    const m = new BucketMap(1, 1, 2);
    for (const k of ['a', 'b', 'c', 'd']) expect(m.take(k, 0)).toBe(true);
    expect(m.take('d', 0)).toBe(false);
  });
});

describe('the site password', () => {
  it('backs off, doubling to a cap, and resets on success', () => {
    const b = new PasswordBackoff(1000, 4000);
    expect([b.fail('a', 0), b.fail('a', 0), b.fail('a', 0), b.fail('a', 0)]).toEqual([1000, 2000, 4000, 4000]);
    expect(b.wait('a', 1000)).toBe(3000);
    expect(b.wait('b', 1000)).toBe(0);
    b.reset('a');
    expect(b.wait('a', 1000)).toBe(0);
    expect(b.fail('a', 2000)).toBe(1000);
  });

  it('over HTTP: a wrong password waits, and never reaches the store or the engine', async () => {
    const h = await up(testConfig({ sitePassword: 'hunter2' }, { backoffStartMs: 60, backoffMaxMs: 500 }));
    const save = vi.spyOn(h.app.store, 'save');
    const first = await post(h, '/api/g/default/join', { name: 'Ann', password: 'wrong' });
    expect(first.status).toBe(401);
    expect(((await first.json()) as { retryMs: number }).retryMs).toBe(60);
    expect((await post(h, '/api/g/default/join', { name: 'Ann', password: 'hunter2' })).status).toBe(429);
    await new Promise((r) => setTimeout(r, 70));
    const second = await post(h, '/api/g/default/join', { name: 'Ann', password: 'wrong' });
    expect(((await second.json()) as { retryMs: number }).retryMs).toBe(120);
    expect(save).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 130));
    expect((await post(h, '/api/g/default/join', { name: 'Ann', password: 'hunter2' })).status).toBe(200);
    expect(save).toHaveBeenCalled();
    const third = await post(h, '/api/g/default/join', { name: 'Bo', password: 'wrong' });
    expect(((await third.json()) as { retryMs: number }).retryMs).toBe(60);
  });

  it('names need the password, sent in a header', async () => {
    const h = await up(testConfig({ sitePassword: 'hunter2' }));
    expect((await fetch(`${h.base}/api/g/default/names`)).status).toBe(401);
  });

  it('an exposed server without one refuses to start', () => {
    expect(() => loadConfig({ TRUST_PROXY: 'caddy' })).toThrow(StartupRefused);
    expect(() => loadConfig({ PUBLIC_URL: 'https://x.example' })).toThrow(StartupRefused);
    expect(() => loadConfig({ PUBLIC_URL: 'https://x.example', SITE_PASSWORD: 'p' })).not.toThrow();
    expect(() => loadConfig({})).not.toThrow();
    expect(() => assertSafe({ trustProxy: false, publicUrl: 'http://192.168.1.2', sitePassword: '' })).not.toThrow();
  });
});

describe('HTTP', () => {
  it('sets a strict CSP and friends', async () => {
    const h = await up();
    const res = await fetch(`${h.base}/healthz`);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('caps bodies, names, players and live games', async () => {
    const h = await up(testConfig({}, { playersPerGame: 2, liveGames: 2 }));
    expect((await post(h, '/api/g/default/join', { name: 'x'.repeat(70_000) })).status).toBe(413);
    expect((await join(h, 'x'.repeat(70))).status).toBe(400);
    const j = await join(h, ' A\u0007nn '.padEnd(30, 'n'));
    expect(j.status).toBe(200);
    expect(h.app.games.get('default')?.state.players[j.body.playerId as never]?.name).toHaveLength(24);
    await join(h, 'Bo');
    expect((await join(h, 'Cy')).status).toBe(409);
    expect((await join(h, 'Di', {}, 'second')).status).toBe(200);
    expect((await join(h, 'Ed', {}, 'third')).status).toBe(503);
    expect((await join(h, 'Ed', {}, 'bad code!')).status).toBe(400);
  });

  it('/api/status answers the machine itself only', async () => {
    const h = await up();
    const res = await fetch(`${h.base}/api/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ engineVersion: ENGINE_VERSION, games: [{ code: 'default' }] });
    const proxied = await fetch(`${h.base}/api/status`, { headers: { 'x-forwarded-for': '1.2.3.4' } });
    expect(proxied.status).toBe(404);
  });

  it('/api/status names nobody, and only a command counts as activity', async () => {
    const h = await up();
    const status = async () =>
      (await (await fetch(`${h.base}/api/status`)).json()) as { lastActivity: number; games: { players: number }[] };
    const live = () => h.app.games.get('default') as LiveGame;
    const st = await connect(h, 'Zebedee', { wantsStoryteller: true });
    const text = JSON.stringify(await status());
    expect(text).not.toContain('Zebedee');
    expect((await status()).games[0]?.players).toBe(1);

    live().lastActivity = 5;
    const again = await dial(h, st.cookie, st.id);
    expect((await status()).lastActivity).toBe(5);

    await st.do({ type: 'open_setup' });
    expect((await status()).lastActivity).toBeGreaterThan(5);
    again.close();
    st.close();
  });
});
