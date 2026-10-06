// GameManager: gameCode -> live game (state + connected sockets). v1 has one entry ("default").
import type { WebSocket } from 'ws';
import type { GameState, Intent, JoinRequest } from '@ct/shared';
import { randomUUID } from 'crypto';
import type { Store } from './db';
import { applyIntent, createGame, joinPlayer, rebindPlayer, type GameEvent } from './engine/game';
import { adminView, playerView } from './engine/views';
import { migrate } from './engine/migrate';

interface Client { ws: WebSocket; playerId: string }

export interface LiveGame {
  state: GameState;
  clients: Set<Client>;
  seq: number;
}

export class GameManager {
  private games = new Map<string, LiveGame>();

  constructor(private store: Store) {
    for (const s of store.loadAll().map(migrate)) this.games.set(s.code, { state: s, clients: new Set(), seq: store.nextSeq(s.id) });
  }

  ensure(code: string): LiveGame {
    let g = this.games.get(code);
    if (!g) {
      const state = createGame(code, Date.now());
      g = { state, clients: new Set(), seq: this.store.nextSeq(state.id) };
      this.games.set(code, g);
      this.commit(g, state, [{ type: 'game_created', actor: null, payload: { code } }]);
    }
    return g;
  }

  get(code: string): LiveGame | undefined {
    return this.games.get(code);
  }

  playerByToken(g: LiveGame, token: string | undefined | null) {
    if (!token) return undefined;
    return g.state.players.find((p) => p.tokens.includes(token));
  }

  private commit(g: LiveGame, state: GameState, events: GameEvent[]) {
    const now = Date.now();
    const rows = events.map((e) => ({ seq: g.seq++, ts: now, actor: e.actor, type: e.type, payload: e.payload }));
    g.state = state;
    this.store.save(state, rows);
    this.broadcast(g);
  }

  join(g: LiveGame, req: JoinRequest) {
    const token = randomUUID();
    const r = joinPlayer(g.state, req, token, Date.now());
    if (!r.ok) return r;
    this.commit(g, r.state, [{ type: 'join', actor: r.player.id, payload: { name: r.player.name, isAdmin: r.player.isAdmin } }]);
    return { ok: true as const, token, playerId: r.player.id, isAdmin: r.player.isAdmin, notice: r.notice };
  }

  rebind(g: LiveGame, playerId: string) {
    const token = randomUUID();
    const r = rebindPlayer(g.state, playerId, token);
    if (!r.ok) return r;
    const p = r.state.players.find((x) => x.id === playerId)!;
    this.commit(g, r.state, [{ type: 'rebind', actor: playerId, payload: {} }]);
    return { ok: true as const, token, playerId, isAdmin: p.isAdmin };
  }

  intent(g: LiveGame, playerId: string, intent: Intent) {
    const r = applyIntent(g.state, playerId, intent, { now: Date.now() });
    if (!r.ok) return r;
    this.commit(g, r.state, r.events);
    return r;
  }

  reset(code: string) {
    const g = this.games.get(code);
    if (!g) return;
    this.store.deleteGame(g.state.id);
    const state = createGame(code, Date.now());
    g.state = state;
    g.seq = 1;
    this.commit(g, state, [{ type: 'game_created', actor: null, payload: { code } }]);
  }

  // ---- sockets --------------------------------------------------------------------------------
  attach(g: LiveGame, ws: WebSocket, playerId: string) {
    const c: Client = { ws, playerId };
    g.clients.add(c);
    this.touch(g, playerId);
    this.send(g, c);
    this.broadcastAdmin(g);
    ws.on('close', () => {
      g.clients.delete(c);
      this.broadcastAdmin(g);
    });
  }

  touch(g: LiveGame, playerId: string) {
    const p = g.state.players.find((x) => x.id === playerId);
    if (p) p.lastSeenAt = Date.now();
  }

  presence(g: LiveGame): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const p of g.state.players) out[p.id] = false;
    for (const c of g.clients) out[c.playerId] = true;
    return out;
  }

  viewFor(g: LiveGame, playerId: string) {
    const p = g.state.players.find((x) => x.id === playerId);
    if (!p) return null;
    const now = Date.now();
    return p.isAdmin ? adminView(g.state, playerId, now, this.presence(g)) : playerView(g.state, playerId, now);
  }

  private send(g: LiveGame, c: Client) {
    if (c.ws.readyState !== 1) return;
    const view = this.viewFor(g, c.playerId);
    c.ws.send(JSON.stringify(view ? { type: 'view', view } : { type: 'removed' }));
  }

  broadcast(g: LiveGame) {
    for (const c of g.clients) this.send(g, c);
  }

  private broadcastAdmin(g: LiveGame) {
    for (const c of g.clients) if (c.playerId === g.state.adminId) this.send(g, c);
  }
}
