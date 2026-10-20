import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash, timingSafeEqual } from 'crypto';
import type { Intent, JoinRequest } from '@ct/shared';
import { Store } from './db';
import { GameManager, type LiveGame } from './manager';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? path.resolve('data');
const DEFAULT_GAME_CODE = process.env.DEFAULT_GAME_CODE ?? 'default';
const PUBLIC_URL = process.env.PUBLIC_URL ?? '';
/** Optional shared password for the whole game (set on internet-facing instances). Empty = no password. */
const SITE_PASSWORD = process.env.SITE_PASSWORD ?? '';
/** Set when running behind a reverse proxy (Caddy) so client IPs and https are read from X-Forwarded-* headers. */
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = [process.env.CLIENT_DIR, path.resolve(here, '../../client/dist'), path.resolve(here, '../client')]
  .find((d) => d && fs.existsSync(path.join(d, 'index.html')));

const store = new Store(DATA_DIR);
const games = new GameManager(store);
games.ensure(DEFAULT_GAME_CODE);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 64 * 1024, trustProxy: TRUST_PROXY });

// ---- shared password ------------------------------------------------------------------------------
const digest = (v: string) => createHash('sha256').update(v).digest();
const PASSWORD_DIGEST = SITE_PASSWORD ? digest(SITE_PASSWORD) : null;
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function lockedOut(ip: string): boolean {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() > f.resetAt) { failures.delete(ip); return false; }
  return f.count >= FAIL_LIMIT;
}

function recordFailure(ip: string) {
  const f = failures.get(ip);
  if (!f || Date.now() > f.resetAt) failures.set(ip, { count: 1, resetAt: Date.now() + FAIL_WINDOW_MS });
  else f.count++;
}

/**
 * Gate for endpoints that hand out or reveal access (names, join, rebind). Sends the error reply itself.
 * Repeated wrong passwords from one IP are locked out for 15 minutes.
 */
function passwordGate(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!PASSWORD_DIGEST) return true;
  if (lockedOut(req.ip)) { reply.code(429).send({ ok: false, error: 'Too many wrong passwords. Try again in 15 minutes.', passwordRequired: true }); return false; }
  const given = req.headers['x-site-password'];
  if (typeof given === 'string' && given && timingSafeEqual(digest(given), PASSWORD_DIGEST)) return true;
  if (typeof given === 'string' && given) recordFailure(req.ip);
  reply.code(401).send({ ok: false, error: given ? 'Wrong password.' : 'This game needs a password.', passwordRequired: true });
  return false;
}

const COOKIE = (code: string) => `ct_${code}`;

function tokenFrom(req: FastifyRequest, code: string): string | undefined {
  const h = req.headers['x-player-token'];
  if (typeof h === 'string' && h) return h;
  const cookie = req.headers.cookie ?? '';
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE(code)) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function setTokenCookie(reply: FastifyReply, code: string, token: string) {
  const secure = reply.request.protocol === 'https' ? '; Secure' : '';
  reply.header('set-cookie', `${COOKIE(code)}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly${secure}`);
}

function gameOr404(code: string, reply: FastifyReply): LiveGame | undefined {
  // v1: only the default game exists. Multi-game: create on demand behind a "create game" screen.
  const g = games.get(code);
  if (!g) reply.code(404).send({ ok: false, error: 'No such game.' });
  return g;
}

app.get('/healthz', async () => ({ ok: true }));

// Which build is running (baked into the image by the GitHub workflows). Storyteller-only: see /events.
const BUILD = {
  version: process.env.APP_VERSION || 'dev',
  commit: process.env.GIT_SHA || null,
  builtAt: process.env.BUILD_DATE || null,
  startedAt: Date.now(),
};

app.get('/api/config', async () => ({ publicUrl: PUBLIC_URL, defaultGame: DEFAULT_GAME_CODE, passwordRequired: !!PASSWORD_DIGEST }));

app.get<{ Params: { code: string } }>('/api/g/:code/names', async (req, reply) => {
  if (!passwordGate(req, reply)) return;
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  return {
    ok: true,
    hasAdmin: !!g.state.adminId,
    phase: g.state.phase,
    players: g.state.players.map((p) => ({ id: p.id, name: p.name, isAdmin: p.isAdmin })),
  };
});

app.get<{ Params: { code: string } }>('/api/g/:code/session', async (req, reply) => {
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  const p = games.playerByToken(g, tokenFrom(req, req.params.code));
  return p ? { ok: true, playerId: p.id, isAdmin: p.isAdmin } : { ok: false };
});

app.post<{ Params: { code: string }; Body: JoinRequest }>('/api/g/:code/join', async (req, reply) => {
  if (!passwordGate(req, reply)) return;
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  const b = req.body ?? ({} as JoinRequest);
  const r = games.join(g, { name: String(b.name ?? ''), rolePreference: b.rolePreference ?? 'none', wantsAdmin: !!b.wantsAdmin });
  if (!r.ok) return reply.code(400).send(r);
  setTokenCookie(reply, req.params.code, r.token);
  return r;
});

app.post<{ Params: { code: string }; Body: { playerId: string } }>('/api/g/:code/rebind', async (req, reply) => {
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  const playerId = String(req.body?.playerId ?? '');
  // A device that still holds this player's login cookie may rebind without the password; anyone else needs it.
  const cookieOwner = games.playerByToken(g, tokenFrom(req, req.params.code));
  if (cookieOwner?.id !== playerId && !passwordGate(req, reply)) return;
  const r = games.rebind(g, playerId);
  if (!r.ok) return reply.code(400).send(r);
  setTokenCookie(reply, req.params.code, r.token);
  return r;
});

app.post<{ Params: { code: string }; Body: { intent: Intent } }>('/api/g/:code/intent', async (req, reply) => {
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  const p = games.playerByToken(g, tokenFrom(req, req.params.code));
  if (!p) return reply.code(401).send({ ok: false, error: 'Unknown player. Rejoin the game.' });
  const r = games.intent(g, p.id, req.body?.intent);
  if (!r.ok) {
    req.log.warn({ player: p.id, intent: req.body?.intent?.type, error: r.error }, 'rejected intent');
    return reply.code(400).send(r);
  }
  return { ok: true, data: r.data ?? null };
});

app.get<{ Params: { code: string } }>('/api/g/:code/view', async (req, reply) => {
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  const p = games.playerByToken(g, tokenFrom(req, req.params.code));
  if (!p) return reply.code(401).send({ ok: false });
  return { ok: true, view: games.viewFor(g, p.id) };
});

app.get<{ Params: { code: string } }>('/api/g/:code/events', async (req, reply) => {
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  const p = games.playerByToken(g, tokenFrom(req, req.params.code));
  if (!p || !p.isAdmin) return reply.code(403).send({ ok: false, error: 'Storyteller only.' });
  return { ok: true, events: store.events(g.state.id), build: BUILD };
});

app.post<{ Params: { code: string } }>('/api/g/:code/reset', async (req, reply) => {
  const g = gameOr404(req.params.code, reply);
  if (!g) return;
  const p = games.playerByToken(g, tokenFrom(req, req.params.code));
  if (!p || !p.isAdmin) return reply.code(403).send({ ok: false, error: 'Storyteller only.' });
  games.reset(req.params.code);
  return { ok: true };
});

if (CLIENT_DIR) {
  app.register(fastifyStatic, { root: CLIENT_DIR, prefix: '/', wildcard: false, index: false });
  const index = fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8');
  app.get('/', async (_req, reply) => reply.redirect(`/g/${DEFAULT_GAME_CODE}`));
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) return reply.code(404).send({ ok: false, error: 'Not found' });
    reply.type('text/html').send(index);
  });
} else {
  app.get('/', async () => 'Client not built. Run `npm run build -w client`.');
}

const wss = new WebSocketServer({ noServer: true });
app.server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const m = url.pathname.match(/^\/ws\/g\/([^/]+)$/);
  const g = m ? games.get(decodeURIComponent(m[1])) : undefined;
  const p = g ? games.playerByToken(g, url.searchParams.get('token')) : undefined;
  if (!g || !p) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    games.attach(g, ws, p.id);
    let alive = true;
    ws.on('pong', () => { alive = true; });
    ws.on('message', () => { games.touch(g, p.id); });
    const ping = setInterval(() => {
      if (!alive) { ws.terminate(); return; }
      alive = false;
      try { ws.ping(); } catch { /* closed */ }
    }, 20000);
    ws.on('close', () => clearInterval(ping));
  });
});

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info(`Clocktower on :${PORT}, data in ${DATA_DIR}, client ${CLIENT_DIR ?? '(not built)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { app.close().finally(() => process.exit(0)); });
