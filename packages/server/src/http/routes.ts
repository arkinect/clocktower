// The HTTP surface. Requests with neither a session nor the right password stay cheap: they are refused from memory.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JoinRequest, RejoinRequest, type ConfigResponse, type PlayerId } from '@ct/protocol';
import { ENGINE_VERSION } from '@ct/rules';
import { cookieHeader, passwordMatches, readCookie, type Sessions } from '../auth/sessions';
import type { Config } from '../config';
import { newPlayerId, type Games } from '../games/manager';
import { BucketMap, PasswordBackoff, TokenBucket, clientIp } from '../limits/limits';
import type { Store } from '../store/store';

const CODE = /^[A-Za-z0-9_-]{1,32}$/;

const cleanName = (raw: string, max: number) =>
  [...raw]
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c !== 127;
    })
    .join('')
    .trim()
    .slice(0, max);

export function registerRoutes(
  app: FastifyInstance,
  config: Config,
  games: Games,
  sessions: Sessions,
  store: Store,
  isLoopback: (req: FastifyRequest) => boolean,
) {
  const { limits } = config;
  const global = new TokenBucket(limits.unauthRate, limits.unauthBurst, Date.now());
  const perIp = new BucketMap(limits.unauthRatePerIp, limits.unauthBurstPerIp);
  const backoff = new PasswordBackoff(limits.backoffStartMs, limits.backoffMaxMs);

  const ipOf = (req: FastifyRequest) =>
    clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], config.trustedProxies);
  const sessionOf = (req: FastifyRequest) => sessions.find(readCookie(req.headers.cookie));

  /** A valid session bypasses abuse limits: players at a venue share one public address. */
  function gate(req: FastifyRequest, reply: FastifyReply): boolean {
    if (sessionOf(req)) return true;
    const now = Date.now();
    if (!perIp.take(ipOf(req), now) || !global.take(now)) {
      void reply
        .code(429)
        .header('Retry-After', '5')
        .send({ ok: false, error: 'Too many requests. Try again shortly.' });
      return false;
    }
    return true;
  }

  /** The site password: wrong ones wait longer each time, per address. */
  function passes(req: FastifyRequest, reply: FastifyReply, given: unknown): boolean {
    if (!config.sitePassword || sessionOf(req)) return true;
    // Asking with no password yet is how a phone learns it needs one. It is not a wrong guess.
    if (given === undefined) {
      void reply.code(401).send({ ok: false, error: 'This game needs a password.' });
      return false;
    }
    const ip = ipOf(req);
    const now = Date.now();
    const wait = backoff.wait(ip, now);
    if (wait > 0) {
      void reply
        .code(429)
        .header('Retry-After', String(Math.ceil(wait / 1000)))
        .send({ ok: false, error: 'Too many wrong passwords. Wait a moment.', retryMs: wait });
      return false;
    }
    if (!passwordMatches(given, config.sitePassword)) {
      const retryMs = backoff.fail(ip, now);
      void reply.code(401).send({ ok: false, error: 'Wrong password.', retryMs });
      return false;
    }
    backoff.reset(ip);
    return true;
  }

  function setSession(reply: FastifyReply, code: string, playerId: string) {
    const token = sessions.issue(code, playerId, Date.now());
    void reply.header('Set-Cookie', cookieHeader(token, config.secureCookies));
  }

  app.get('/healthz', () => ({ ok: true }));

  app.get('/api/config', (): ConfigResponse => ({
    publicUrl: config.publicUrl,
    defaultGame: config.defaultGame,
    passwordRequired: !!config.sitePassword,
    buildId: config.buildId,
  }));

  // Who is in the game, for "I'm already in this game". The password comes in a header so it never lands in a URL.
  app.get<{ Params: { code: string } }>('/api/g/:code/names', (req, reply) => {
    if (!gate(req, reply) || !passes(req, reply, req.headers['x-site-password'])) return reply;
    const game = games.get(req.params.code);
    if (!game) return reply.code(404).send({ ok: false, error: 'No such game.' });
    return { ok: true, players: game.names(), hasStoryteller: game.state.storytellerId !== null };
  });

  app.get<{ Params: { code: string } }>('/api/g/:code/session', (req) => {
    const s = sessionOf(req);
    return { playerId: s?.code === req.params.code ? s.playerId : null };
  });

  app.post<{ Params: { code: string } }>('/api/g/:code/join', async (req, reply) => {
    if (!gate(req, reply)) return reply;
    const body = JoinRequest.safeParse(req.body);
    if (!body.success || !CODE.test(req.params.code)) return reply.code(400).send({ ok: false, error: 'Bad request.' });
    if (!passes(req, reply, body.data.password)) return reply;
    const game = games.ensure(req.params.code);
    if (!game) return reply.code(503).send({ ok: false, error: 'Too many games are running.' });
    if (Object.keys(game.state.players).length >= limits.playersPerGame) {
      return reply.code(409).send({ ok: false, error: 'This game is full.' });
    }
    const name = cleanName(body.data.name, limits.nameLength);
    const id = newPlayerId();
    const outcome = await game.submit(null, {
      type: 'join',
      id,
      name,
      rolePreference: body.data.rolePreference ?? 'none',
      wantsStoryteller: body.data.wantsStoryteller ?? false,
    });
    if (!outcome.ok) return reply.code(409).send({ ok: false, error: outcome.error });
    setSession(reply, game.code, id);
    return { ok: true, playerId: id, isStoryteller: game.state.storytellerId === id };
  });

  // Rejoining as any player is allowed, gated by the password: cheating is out of scope. A new session, never the old.
  app.post<{ Params: { code: string } }>('/api/g/:code/rejoin', (req, reply) => {
    if (!gate(req, reply)) return reply;
    const body = RejoinRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Bad request.' });
    if (!passes(req, reply, body.data.password)) return reply;
    const game = games.get(req.params.code);
    if (!game || !game.state.players[body.data.playerId as PlayerId]) {
      return reply.code(404).send({ ok: false, error: 'No such player.' });
    }
    setSession(reply, game.code, body.data.playerId);
    return { ok: true, playerId: body.data.playerId };
  });

  // The command log plus the engine version, for bug reports.
  app.get<{ Params: { code: string } }>('/api/g/:code/export', (req, reply) => {
    const s = sessionOf(req);
    const game = games.get(req.params.code);
    if (!s || !game || s.code !== game.code || game.state.storytellerId !== s.playerId) {
      return reply.code(403).send({ ok: false, error: 'Only the Storyteller can export.' });
    }
    return {
      engineVersion: ENGINE_VERSION,
      code: game.code,
      createdAt: game.state.createdAt,
      log: store.log(game.code),
    };
  });

  // For update.sh, on the same machine.
  app.get('/api/status', (req, reply) => {
    if (!isLoopback(req)) return reply.code(404).send({ ok: false, error: 'Not found' });
    const all = games.all();
    return {
      engineVersion: ENGINE_VERSION,
      buildId: config.buildId,
      lastActivity: all.reduce((n, g) => Math.max(n, g.lastActivity), 0),
      games: all.map((g) => ({
        code: g.code,
        phase: g.state.phase.kind,
        players: Object.keys(g.state.players).length,
      })),
    };
  });
}
