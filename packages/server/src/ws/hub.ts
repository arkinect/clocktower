// Sockets. Everything is checked at upgrade, before anything is allocated.
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ClientMessage,
  PROTOCOL_VERSION,
  type Jinx,
  type PlayerId,
  type RoleCard,
  type ServerMessage,
} from '@ct/protocol';
import { WebSocket, WebSocketServer } from 'ws';
import type { Sessions } from '../auth/sessions';
import { readCookie } from '../auth/sessions';
import type { Config } from '../config';
import type { Client, Games } from '../games/manager';
import { TokenBucket, clientIp } from '../limits/limits';

interface Live extends Client {
  bucket: TokenBucket;
  misses: number;
  socket: WebSocket;
  sessionHash: string;
  ip: string;
  code: string;
}

const MAX_BUFFERED = 1024 * 1024;

function refuse(socket: Duplex, status: string) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** LAN mode has no public URL, so the page must simply come from the host it is talking to. */
export function originAllowed(origin: string | undefined, host: string | undefined, allowed: readonly string[]) {
  if (!origin) return false;
  if (allowed.length) return allowed.includes(origin);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export class Hub {
  private wss: WebSocketServer;
  private live = new Set<Live>();
  private bySession = new Map<string, number>();
  private byIp = new Map<string, number>();
  private timer: NodeJS.Timeout;

  constructor(
    server: Server,
    private readonly config: Config,
    private readonly games: Games,
    private readonly sessions: Sessions,
    private readonly catalog: RoleCard[],
    private readonly jinxes: Jinx[],
  ) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: config.limits.socketMaxPayload,
      perMessageDeflate: false,
    });
    server.on('upgrade', (req, socket, head) => this.upgrade(req, socket, head));
    this.timer = setInterval(() => this.heartbeat(), config.limits.heartbeatMs);
    this.timer.unref();
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on('error', () => socket.destroy());
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/ws') return refuse(socket, '404 Not Found');
    if (!originAllowed(req.headers.origin, req.headers.host, this.config.allowedOrigins)) {
      return refuse(socket, '403 Forbidden');
    }
    const session = this.sessions.find(readCookie(req.headers.cookie));
    if (!session) return refuse(socket, '401 Unauthorized');
    const game = this.games.get(session.code);
    if (!game || !game.state.players[session.playerId as PlayerId]) return refuse(socket, '401 Unauthorized');
    const ip = clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], this.config.trustedProxies);
    const { socketsPerSession, socketsPerIp } = this.config.limits;
    if ((this.bySession.get(session.hash) ?? 0) >= socketsPerSession) return refuse(socket, '429 Too Many Requests');
    if ((this.byIp.get(ip) ?? 0) >= socketsPerIp) return refuse(socket, '429 Too Many Requests');
    this.bump(this.bySession, session.hash, 1);
    this.bump(this.byIp, ip, 1);
    this.wss.handleUpgrade(req, socket, head, (ws) =>
      this.accept(ws, session.code, session.playerId, session.hash, ip),
    );
  }

  private bump(map: Map<string, number>, key: string, by: number) {
    const n = (map.get(key) ?? 0) + by;
    if (n > 0) map.set(key, n);
    else map.delete(key);
  }

  private accept(ws: WebSocket, code: string, playerId: string, sessionHash: string, ip: string) {
    const { socketMessagesPerSecond, socketBurst } = this.config.limits;
    const send = (m: ServerMessage) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // A phone that stopped reading reconnects and gets a fresh view; the server does not hold its backlog.
      if (ws.bufferedAmount > MAX_BUFFERED) ws.terminate();
      else ws.send(JSON.stringify(m));
    };
    const c: Live = {
      playerId,
      send,
      close: () => ws.close(),
      lastView: null,
      bucket: new TokenBucket(socketMessagesPerSecond, socketBurst, Date.now()),
      misses: 0,
      socket: ws,
      sessionHash,
      ip,
      code,
    };
    this.live.add(c);
    const game = this.games.get(code);
    ws.on('pong', () => {
      c.misses = 0;
    });
    ws.on('message', (raw, isBinary) => void this.message(c, raw.toString(), isBinary));
    ws.on('error', () => ws.terminate());
    ws.on('close', () => {
      this.live.delete(c);
      this.bump(this.bySession, sessionHash, -1);
      this.bump(this.byIp, ip, -1);
      this.games.get(code)?.remove(c);
    });
    send({
      v: PROTOCOL_VERSION,
      type: 'welcome',
      buildId: this.config.buildId,
      catalog: this.catalog,
      jinxes: this.jinxes,
    });
    game?.add(c);
    game?.sendView(c);
  }

  private async message(c: Live, raw: string, isBinary: boolean) {
    c.misses = 0;
    if (isBinary || !c.bucket.take(Date.now())) return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const version = (json as { v?: unknown } | null)?.v;
    if (version !== PROTOCOL_VERSION) {
      c.send({ v: PROTOCOL_VERSION, type: 'reload' });
      return;
    }
    const parsed = ClientMessage.safeParse(json);
    if (!parsed.success) {
      const requestId = (json as { requestId?: unknown }).requestId;
      if (typeof requestId === 'string' && requestId.length <= 64) {
        c.send({ v: PROTOCOL_VERSION, type: 'ack', requestId, ok: false, error: 'Bad request.' });
      }
      return;
    }
    const m = parsed.data;
    if (m.type === 'ping') {
      c.send({ v: PROTOCOL_VERSION, type: 'pong' });
      return;
    }
    if (m.type === 'hello') {
      if (m.buildId !== this.config.buildId) c.send({ v: PROTOCOL_VERSION, type: 'reload' });
      return;
    }
    const game = this.games.get(c.code);
    if (!game) return;
    if (m.command.type === 'join') {
      c.send({ v: PROTOCOL_VERSION, type: 'ack', requestId: m.requestId, ok: false, error: 'You cannot do that.' });
      return;
    }
    const outcome = await game.submit(c.playerId as PlayerId, m.command);
    c.send({
      v: PROTOCOL_VERSION,
      type: 'ack',
      requestId: m.requestId,
      ok: outcome.ok,
      ...(outcome.ok ? { data: outcome.data } : { error: outcome.error }),
    });
  }

  private heartbeat() {
    for (const c of this.live) {
      if (c.misses >= this.config.limits.heartbeatMisses) {
        c.socket.terminate();
        continue;
      }
      c.misses += 1;
      c.socket.ping();
    }
  }

  socketCount() {
    return this.live.size;
  }

  close() {
    clearInterval(this.timer);
    for (const c of this.live) c.socket.terminate();
    this.wss.close();
  }
}
