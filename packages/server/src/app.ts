// Builds the server. main.ts starts it; the tests build it on a free port.
import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import type { Writable } from 'node:stream';
import helmet from '@fastify/helmet';
import Fastify, { LogController } from 'fastify';
import { allCards, allJinxes } from '@ct/rules';
import { Sessions } from './auth/sessions';
import type { Config } from './config';
import { Games } from './games/manager';
import { registerRoutes } from './http/routes';
import { Store } from './store/store';
import { Hub } from './ws/hub';

export interface Built {
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
  games: Games;
  store: Store;
  hub: Hub;
}

export async function buildApp(config: Config, logStream?: Writable): Promise<Built> {
  const app = Fastify({
    bodyLimit: config.limits.bodyBytes,
    requestTimeout: 15_000,
    // Per-request logs would carry addresses and URLs. Logs hold the player id and command type only.
    logger: logStream ? { level: 'info', stream: logStream } : { level: process.env['LOG_LEVEL'] ?? 'info' },
    logController: new LogController({ disableRequestLogging: true }),
  });

  const store = new Store(config.dataDir);
  const sessions = new Sessions(store);
  const games = new Games(
    store,
    config.limits,
    (code, id) => sessions.drop(code, id),
    (code) => sessions.dropGame(code),
    {
      command: (player, command) => app.log.info({ player, command }),
      failed: (player, command, e) =>
        app.log.error({ player, command, error: e instanceof Error ? e.message : 'unknown' }),
    },
    config.defaultGame,
  );
  games.restore();
  games.ensure(config.defaultGame);

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: config.hsts ? { maxAge: 15_552_000, includeSubDomains: false } : false,
  });

  const isLoopback = (req: { socket: { remoteAddress?: string | undefined }; headers: Record<string, unknown> }) => {
    const peer = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    return (peer === '127.0.0.1' || peer === '::1') && !req.headers['x-forwarded-for'];
  };
  registerRoutes(app, config, games, sessions, store, isLoopback);

  const web = config.webDir;
  if (web && fs.existsSync(web)) {
    // Loaded only when there is a client to serve: the tests run on a Node that cannot require its ES dependencies.
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, {
      root: path.resolve(web),
      prefix: '/',
      wildcard: false,
      index: false,
      cacheControl: false,
    });
    app.get('/', (_req, reply) => reply.redirect(`/g/${config.defaultGame}`));
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
        return reply.code(404).send({ ok: false, error: 'Not found' });
      }
      // Caddy sets long caching for assets. The page must always be fresh, so a new build reaches phones.
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }

  await app.ready();
  const jinxes = allJinxes().map(({ a, b, text }) => ({ a, b, text }));
  const hub = new Hub(app.server as Server, config, games, sessions, allCards(), jinxes);

  return {
    async listen(port = config.port) {
      await app.listen({ port, host: '0.0.0.0' });
      const address = app.server.address();
      return typeof address === 'object' && address ? address.port : port;
    },
    async close() {
      hub.close();
      await app.close();
      store.close();
    },
    games,
    store,
    hub,
  };
}
