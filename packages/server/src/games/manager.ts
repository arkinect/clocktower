// Live games in memory. Each game runs one command at a time from a bounded queue, persists it, then broadcasts.
import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { Command, PlayerId, ServerMessage, View } from '@ct/protocol';
import { ENGINE_VERSION, GameState, createGame, dispatch, project, type GameStateT } from '@ct/rules';
import type { Limits } from '../config';
import type { GameRow, Store } from '../store/store';

export interface Client {
  playerId: string;
  send(m: ServerMessage): void;
  close(): void;
  /** Hash of the last view sent, so an unchanged view is never sent twice. */
  lastView: string | null;
}

/** Logs carry the player id and the command type, nothing else. */
export interface Audit {
  command(actor: string | null, type: string): void;
  failed(actor: string | null, type: string, error: unknown): void;
}

export type Outcome = { ok: true; data?: unknown } | { ok: false; error: string };

interface Job {
  actor: PlayerId | null;
  command: Command;
  done(o: Outcome): void;
}

const viewHash = (view: View) => {
  return createHash('sha1')
    .update(JSON.stringify({ ...view, serverNow: 0 }))
    .digest('base64');
};

export class LiveGame {
  clients = new Set<Client>();
  private queue: Job[] = [];
  private draining = false;
  lastActivity: number;
  logLength: number;

  constructor(
    public state: GameStateT,
    private readonly store: Store,
    private readonly limits: Limits,
    private readonly onRemoved: (code: string, playerId: string) => void,
    private readonly audit: Audit,
    logLength: number,
  ) {
    this.lastActivity = Date.now();
    this.logLength = logLength;
  }

  get code() {
    return this.state.code;
  }

  /** Queues a command. Beyond the bound it is refused at once, with a retry message. */
  submit(actor: PlayerId | null, command: Command): Promise<Outcome> {
    if (this.queue.length >= this.limits.queuePerGame) {
      return Promise.resolve({ ok: false, error: 'The server is busy. Please try again.' });
    }
    if (this.logLength >= this.limits.commandsPerGame) {
      return Promise.resolve({ ok: false, error: 'This game has reached its command limit.' });
    }
    return new Promise((done) => {
      this.queue.push({ actor, command, done });
      if (!this.draining) {
        this.draining = true;
        setImmediate(() => this.drain());
      }
    });
  }

  private drain() {
    const job = this.queue.shift();
    if (!job) {
      this.draining = false;
      return;
    }
    let outcome: Outcome;
    try {
      outcome = this.run(job);
    } catch (e) {
      this.audit.failed(job.actor, job.command.type, e);
      outcome = { ok: false, error: 'Something went wrong.' };
    }
    job.done(outcome);
    setImmediate(() => this.drain());
  }

  private run(job: Job): Outcome {
    const now = Date.now();
    const res = dispatch(this.state, job.actor, job.command, { now, seed: randomInt(2 ** 31) });
    this.audit.command(job.actor, job.command.type);
    if (!res.ok) return { ok: false, error: res.error };
    const before = this.state;
    this.state = res.state;
    this.logLength += 1;
    this.lastActivity = now;
    this.store.save(this.code, ENGINE_VERSION, JSON.stringify(res.state), this.logLength, res.entry);
    this.afterChange(before);
    return { ok: true, data: res.data };
  }

  private afterChange(before: GameStateT) {
    for (const id of Object.keys(before.players)) {
      if (this.state.players[id as PlayerId]) continue;
      this.onRemoved(this.code, id);
      for (const c of [...this.clients]) {
        if (c.playerId === id) {
          c.send({ v: 1, type: 'removed' });
          c.close();
          this.clients.delete(c);
        }
      }
    }
    this.broadcast();
  }

  presence(): Record<string, boolean> {
    return Object.fromEntries([...this.clients].map((c) => [c.playerId, true]));
  }

  viewFor(playerId: string): View | null {
    const id = playerId as PlayerId;
    if (!this.state.players[id]) return null;
    return project(this.state, id, { now: Date.now(), presence: this.presence() });
  }

  sendView(c: Client) {
    const view = this.viewFor(c.playerId);
    if (!view) return;
    const hash = viewHash(view);
    if (hash === c.lastView) return;
    c.lastView = hash;
    c.send({ v: 1, type: 'view', view });
  }

  broadcast() {
    for (const c of this.clients) this.sendView(c);
  }

  add(c: Client) {
    this.clients.add(c);
    this.broadcastPresence();
  }

  remove(c: Client) {
    this.clients.delete(c);
    this.broadcastPresence();
  }

  /** Presence reaches the Storyteller only. */
  private broadcastPresence() {
    for (const c of this.clients) if (c.playerId === this.state.storytellerId) this.sendView(c);
  }

  names() {
    return Object.values(this.state.players).map((p) => ({ id: p.id, name: p.name }));
  }
}

export class Games {
  private games = new Map<string, LiveGame>();

  constructor(
    private readonly store: Store,
    private readonly limits: Limits,
    private readonly dropSessions: (code: string, playerId: string) => void,
    private readonly dropGameSessions: (code: string) => void,
    private readonly audit: Audit,
    private readonly keep: string,
    private readonly now: () => number = Date.now,
  ) {}

  private live(state: GameStateT, logLength: number) {
    const g = new LiveGame(state, this.store, this.limits, this.dropSessions, this.audit, logLength);
    this.games.set(state.code, g);
    return g;
  }

  /** A snapshot from another engine version, or one that fails to parse, is archived. No migration code exists. */
  restore() {
    for (const row of this.store.games()) {
      const parsed = this.parse(row.snapshot);
      if (row.engine !== ENGINE_VERSION) this.archive(row, `engine ${row.engine}`);
      else if (!parsed.state) this.archive(row, parsed.reason);
      else this.live(parsed.state, this.store.logLength(row.code));
    }
  }

  private archive(row: GameRow, reason: string) {
    this.store.archive(row, reason, this.now(), this.limits.archiveKeep);
    this.dropGameSessions(row.code);
  }

  private parse(snapshot: string): { state: GameStateT; reason?: never } | { state: null; reason: string } {
    let json: unknown;
    try {
      json = JSON.parse(snapshot);
    } catch {
      return { state: null, reason: 'unreadable snapshot' };
    }
    const r = GameState.safeParse(json);
    return r.success ? { state: r.data } : { state: null, reason: 'snapshot failed the schema' };
  }

  get(code: string) {
    return this.games.get(code);
  }

  all() {
    return [...this.games.values()];
  }

  /** An abandoned game must not hold a slot for ever. The default game always stays. */
  private evictIdle(): boolean {
    const idle = this.all().find(
      (g) => g.code !== this.keep && g.clients.size === 0 && this.now() - g.lastActivity > IDLE_MS,
    );
    if (!idle) return false;
    this.archive({ code: idle.code, engine: ENGINE_VERSION, snapshot: JSON.stringify(idle.state) }, 'idle');
    this.games.delete(idle.code);
    return true;
  }

  /** Creates a game, up to the cap. */
  ensure(code: string): LiveGame | null {
    const found = this.games.get(code);
    if (found) return found;
    if (this.games.size >= this.limits.liveGames && !this.evictIdle()) return null;
    const state = createGame(code, this.now());
    this.store.save(code, ENGINE_VERSION, JSON.stringify(state), 0, null);
    return this.live(state, 0);
  }
}

export const IDLE_MS = 6 * 60 * 60_000;

export const newPlayerId = () => randomUUID().replace(/-/g, '').slice(0, 16) as PlayerId;
