// A bad id or a view that cannot be built costs one request or one socket, never the process or the saved game.
import { randomBytes, createHash } from 'node:crypto';
import { connect as dialTcp } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerId } from '@ct/protocol';
import { ENGINE_VERSION, type GameStateT } from '@ct/rules';
import type { LiveGame } from '../src/games/manager';
import { Store } from '../src/store/store';
import { connect, dial, join, open, start, table, testConfig, type Client, type Harness } from './helpers/client';

const broken = vi.hoisted(() => ({ when: null as null | ((s: unknown, id: string) => boolean) }));
vi.mock('@ct/rules', async (original) => {
  const rules = await original<typeof import('@ct/rules')>();
  const project: typeof rules.project = (s, id, o) => {
    if (broken.when?.(s, id)) throw new Error('broken view');
    return rules.project(s, id, o);
  };
  return { ...rules, project };
});

const NAMES = Object.getOwnPropertyNames(Object.prototype);
const opened: Harness[] = [];
const up = async (config = testConfig()) => {
  const h = await start(config);
  opened.push(h);
  return h;
};
const pause = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const closed = (c: Client) => new Promise<void>((resolve) => c.ws.once('close', () => resolve()));
const live = (h: Harness) => h.app.games.get('default') as LiveGame;
const alive = async (h: Harness) => (await fetch(`${h.base}/healthz`)).ok;

afterEach(async () => {
  broken.when = null;
  for (const h of opened.splice(0)) await h.app.close();
  vi.restoreAllMocks();
});

describe('inherited names', () => {
  it('cannot be rejoined as', async () => {
    const h = await up();
    await join(h, 'Ann');
    for (const playerId of NAMES) {
      const res = await fetch(`${h.base}/api/g/default/rejoin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      expect(res.status, playerId).toBe(400);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('a session that already holds one is refused at upgrade', async () => {
    const config = testConfig();
    const first = await start(config);
    await join(first, 'Ann');
    await first.app.close();
    const store = new Store(config.dataDir);
    const tokens = NAMES.map((playerId) => {
      const token = randomBytes(32).toString('base64url');
      const hash = createHash('sha256').update(token).digest('hex');
      store.addSession({ hash, code: 'default', playerId, createdAt: Date.now() });
      return token;
    });
    store.close();
    const h = await up(config);
    for (const t of tokens) {
      await expect(open(h, { origin: h.base, cookie: `ct_session=${t}` })).rejects.toThrow('401');
    }
    expect(await alive(h)).toBe(true);
  });

  it('a saved game with one in a seat is archived at start', async () => {
    const config = testConfig();
    const first = await start(config);
    await join(first, 'Ann');
    const state = JSON.parse(first.app.store.games()[0]!.snapshot) as GameStateT;
    await first.app.close();
    state.seats.push({ playerId: 'constructor' as PlayerId, joined: { kind: 'night', n: -1 }, left: null });
    const store = new Store(config.dataDir);
    store.save('default', ENGINE_VERSION, JSON.stringify(state), 2, null);
    store.close();
    const h = await up(config);
    expect(h.app.store.archived()).toEqual([{ code: 'default', reason: 'snapshot failed the schema' }]);
    expect(live(h).state.players.size).toBe(0);
  });
});

describe('a state that cannot be shown', () => {
  it('is refused and not kept, whoever it cannot be shown to', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    // Bo has joined but is not connected: the view still has to build.
    const bo = await join(h, 'Bo');
    const before = live(h).state;
    const saved = h.app.store.games()[0]!.snapshot;
    const logged = h.app.store.log('default').length;
    broken.when = (s, id) => s !== before && id === bo.body.playerId;
    expect(await st.send({ type: 'open_setup' })).toMatchObject({ ok: false, error: 'Something went wrong.' });
    expect(live(h).state).toBe(before);
    expect(h.app.store.games()[0]!.snapshot).toBe(saved);
    expect(h.app.store.log('default')).toHaveLength(logged);
    expect(h.logs.join('')).toContain('broken view');

    broken.when = null;
    await st.do({ type: 'open_setup' });
    await st.until((v) => v.phase.kind === 'setup');
    const again = await dial(h, bo.cookie!.split(';')[0]!, bo.body.playerId);
    expect(again.me.phase.kind).toBe('setup');
  });

  it('a save that fails leaves the game as it was', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const game = live(h);
    const before = game.state;
    const { logLength } = game;
    const save = vi.spyOn(h.app.store, 'save').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(await st.send({ type: 'open_setup' })).toMatchObject({ ok: false, error: 'Something went wrong.' });
    expect(game.state).toBe(before);
    expect(game.logLength).toBe(logLength);
    save.mockRestore();
    await st.do({ type: 'open_setup' });
  });
});

describe('a view that cannot be built', () => {
  it('closes that socket only, on connecting and on reconnecting', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const bo = await connect(h, 'Bo');
    const cy = await connect(h, 'Cy');
    bo.close();
    await pause();
    broken.when = (_s, id) => id === bo.id;
    for (let i = 0; i < 2; i++) {
      const ws = await open(h, { origin: h.base, cookie: bo.cookie });
      await new Promise((resolve) => ws.once('close', resolve));
    }
    expect(await alive(h)).toBe(true);
    broken.when = null;
    await st.do({ type: 'open_setup' });
    await cy.until((v) => v.phase.kind === 'setup');
    await dial(h, bo.cookie, bo.id);
  });

  it('a presence change that cannot be shown does not throw out of the close', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const bo = await connect(h, 'Bo');
    broken.when = (_s, id) => id === st.id;
    const gone = closed(st);
    bo.close();
    await gone;
    expect(await alive(h)).toBe(true);
  });

  it('does not stop the others in a broadcast', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const bo = await connect(h, 'Bo');
    const gone = closed(st);
    const views = () => bo.raw.filter((m) => m.includes('"type":"view"')).length;
    const seen = views();
    for (const c of live(h).clients) c.lastView = null;
    broken.when = (_s, id) => id === st.id;
    live(h).broadcast();
    await gone;
    expect(views()).toBe(seen + 1);
  });
});

describe('errors behind a socket', () => {
  it('an error in the rules is logged, and the player is not shown it', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const game = live(h);
    const before = game.state;
    game.state = { ...before, seats: null as never };
    expect(await st.send({ type: 'open_setup' })).toMatchObject({ ok: false, error: 'Something went wrong.' });
    const line = h.logs.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l['error']);
    expect(line).toMatchObject({
      player: st.id,
      command: 'open_setup',
      error: expect.stringMatching(/null/) as string,
    });
    game.state = before;
    // A refusal is not an error.
    const logged = h.logs.filter((l) => l.includes('"error"')).length;
    expect((await st.send({ type: 'start_night' })).ok).toBe(false);
    expect(h.logs.filter((l) => l.includes('"error"'))).toHaveLength(logged);
  });

  it('a command that fails unexpectedly is answered', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    vi.spyOn(live(h), 'submit').mockRejectedValue(new Error('boom'));
    expect(await st.send({ type: 'open_setup' })).toMatchObject({ ok: false, error: 'Something went wrong.' });
    expect(await alive(h)).toBe(true);
  });

  it('a card move that fails does not end the process', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    vi.spyOn(live(h).cards, 'handle').mockImplementation(() => {
      throw new Error('boom');
    });
    st.play({ type: 'sit' });
    await pause();
    expect(await alive(h)).toBe(true);
    expect((await st.send({ type: 'open_setup' })).ok).toBe(true);
  });

  it('cards: a night view that cannot be built gives no seat, and the command still counts', async () => {
    const h = await up();
    const { players } = await table(h);
    const ann = players[0] as Client;
    broken.when = (_s, id) => id === ann.id;
    ann.play({ type: 'sit' });
    expect(await ann.untilCards((t) => t === null)).toBeNull();
    expect(await alive(h)).toBe(true);
  });

  it('an upgrade for an address that cannot be read is refused', async () => {
    const h = await up();
    const reply = await new Promise<string>((resolve, reject) => {
      const port = Number(new URL(h.base).port);
      const s = dialTcp(port, '127.0.0.1', () =>
        s.write('GET // HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'),
      );
      let text = '';
      s.on('data', (d) => (text += String(d)));
      s.on('close', () => resolve(text));
      s.on('error', reject);
    });
    expect(reply).toContain('400 Bad Request');
    expect(await alive(h)).toBe(true);
  });
});
