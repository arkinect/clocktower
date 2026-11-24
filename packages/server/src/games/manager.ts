// Live games in memory. Each game runs one command at a time from a bounded queue, persists it, then broadcasts.
import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { Command, PlayerId, ServerMessage, View } from '@ct/protocol';
import { ENGINE_VERSION, createGame, dispatch, loadState, project, saveState, type GameStateT } from '@ct/rules';
import { Tables } from '../cards/tables';
import type { Limits } from '../config';
import type { GameRow, Store } from '../store/store';

export interface Client {
  playerId: string;
  send(m: ServerMessage): void;
  close(): void;
  /** Hash of the last view sent, so an unchanged view is never sent twice. */
  lastView: string | null;
}

/** Views already built from the state being shown, by player. */
type Views = Map<string, View>;

/** Logs carry the player id, the command type (or the part of the server that failed) and the error, nothing else. */
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

/**
 * Commands that start the game over. The command limit counts from the last one, and never refuses one, so a full
 * game can always be left. The bound is on each game, by design: the log as a whole grows by one game's share every
 * time the Storyteller starts over, and only the Storyteller can.
 */
const STARTS_OVER: readonly string[] = ['new_game', 'play_again'];

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
  /** Commands since the game last started over. The log itself keeps every game played under this code. */
  private sinceFresh: number;
  /** The idle card tables. They live and die with the process: nothing about them is stored. */
  readonly cards = new Tables({
    eligible: (playerId) => this.attempt(playerId, 'cards', () => this.idleAtNight(playerId)) ?? false,
    send: (playerId, table) => {
      for (const c of this.clients) if (c.playerId === playerId) c.send({ v: 1, type: 'cards', table });
    },
    failed: (e) => this.audit.failed(null, 'cards', e),
  });

  constructor(
    public state: GameStateT,
    private readonly store: Store,
    private readonly limits: Limits,
    private readonly onRemoved: (code: string, playerId: string) => void,
    private readonly audit: Audit,
    logLength: number,
    sinceFresh: number,
  ) {
    this.lastActivity = Date.now();
    this.logLength = logLength;
    this.sinceFresh = sinceFresh;
  }

  get code() {
    return this.state.code;
  }

  /** Queues a command. Beyond the bound it is refused at once, with a retry message. */
  submit(actor: PlayerId | null, command: Command): Promise<Outcome> {
    if (this.queue.length >= this.limits.queuePerGame) {
      return Promise.resolve({ ok: false, error: 'The server is busy. Please try again.' });
    }
    // One game may not grow without bound, but the way out of a full one must stay open.
    if (this.sinceFresh >= this.limits.commandsPerGame && !STARTS_OVER.includes(command.type)) {
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

  /** Runs something whose failure must stay where it is. The error is logged, and the result undefined. */
  private attempt<T>(actor: string | null, what: string, run: () => T): T | undefined {
    try {
      return run();
    } catch (e) {
      this.audit.failed(actor, what, e);
      return undefined;
    }
  }

  /** The new state is kept only once every view of it has been built and it has been saved. */
  private run(job: Job): Outcome {
    const now = Date.now();
    const res = dispatch(this.state, job.actor, job.command, { now, seed: randomInt(2 ** 31) });
    this.audit.command(job.actor, job.command.type);
    if (!res.ok) {
      if (res.internal) this.audit.failed(job.actor, job.command.type, res.cause);
      return { ok: false, error: res.error };
    }
    // Every player's view, connected or not: one that cannot be built would fail whenever its player next connects.
    const presence = this.presence();
    const views: Views = new Map(
      [...res.state.players.keys()].map((id) => [id, project(res.state, id, { now, presence })]),
    );
    this.store.save(this.code, ENGINE_VERSION, saveState(res.state), this.logLength + 1, res.entry);
    const before = this.state;
    this.state = res.state;
    this.logLength += 1;
    this.sinceFresh = STARTS_OVER.includes(job.command.type) ? 0 : this.sinceFresh + 1;
    this.lastActivity = now;
    this.afterChange(before, views);
    return { ok: true, data: res.data };
  }

  private afterChange(before: GameStateT, views: Views) {
    for (const id of [...before.players.keys()]) {
      if (this.state.players.has(id)) continue;
      this.attempt(id, 'removed', () => this.onRemoved(this.code, id));
      for (const c of [...this.clients]) {
        if (c.playerId === id) {
          c.send({ v: 1, type: 'removed' });
          c.close();
          this.clients.delete(c);
        }
      }
    }
    this.broadcast(views);
    const { kind } = this.state.phase;
    this.attempt(null, 'cards', () => {
      if (kind === 'night' || kind === 'day') this.cards.sync();
      else this.cards.reset();
    });
  }

  /** The same test the phone uses to unlock its night games, and nothing waiting to be answered. */
  private idleAtNight(playerId: string) {
    const view = this.viewFor(playerId);
    if (view?.kind !== 'player' || !view.me.seated) return false;
    const { kind, stage } = view.phase;
    if (kind !== 'night' || stage === 'briefing' || view.me.questions.length) return false;
    return view.me.submitted || stage !== 'collecting';
  }

  presence(): Record<string, boolean> {
    return Object.fromEntries([...this.clients].map((c) => [c.playerId, true]));
  }

  viewFor(playerId: string): View | null {
    const id = playerId as PlayerId;
    if (!this.state.players.has(id)) return null;
    return project(this.state, id, { now: Date.now(), presence: this.presence() });
  }

  /** A view that cannot be built or sent closes that socket, and no other. */
  sendView(c: Client, views?: Views) {
    const sent = this.attempt(c.playerId, 'view', () => {
      this.pushView(c, views ? views.get(c.playerId) : this.viewFor(c.playerId));
      return true;
    });
    if (!sent) c.close();
  }

  private pushView(c: Client, view: View | null | undefined) {
    if (!view) return;
    const hash = viewHash(view);
    if (hash === c.lastView) return;
    c.lastView = hash;
    c.send({ v: 1, type: 'view', view });
  }

  broadcast(views?: Views) {
    for (const c of this.clients) this.sendView(c, views);
  }

  add(c: Client) {
    this.clients.add(c);
    this.broadcastPresence();
  }

  remove(c: Client) {
    this.clients.delete(c);
    if (![...this.clients].some((o) => o.playerId === c.playerId)) {
      this.attempt(c.playerId, 'cards', () => this.cards.drop(c.playerId));
    }
    this.broadcastPresence();
  }

  /** Presence reaches the Storyteller only. */
  private broadcastPresence() {
    for (const c of this.clients) if (c.playerId === this.state.storytellerId) this.sendView(c);
  }

  names() {
    const storyteller = this.state.storytellerId;
    return [...this.state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      isStoryteller: p.id === storyteller,
    }));
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

  private live(state: GameStateT, logLength: number, sinceFresh: number) {
    const g = new LiveGame(state, this.store, this.limits, this.dropSessions, this.audit, logLength, sinceFresh);
    this.games.set(state.code, g);
    return g;
  }

  /** A snapshot from another engine version, or one that fails to parse, is archived. No migration code exists. */
  restore() {
    for (const row of this.store.games()) {
      const parsed = loadState(row.snapshot);
      if (row.engine !== ENGINE_VERSION) this.archive(row, `engine ${row.engine}`);
      else if (!parsed.state) this.archive(row, parsed.reason);
      else this.live(parsed.state, this.store.logLength(row.code), this.store.logLengthSince(row.code, STARTS_OVER));
    }
  }

  private archive(row: GameRow, reason: string) {
    this.store.archive(row, reason, this.now(), this.limits.archiveKeep);
    this.dropGameSessions(row.code);
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
    this.archive({ code: idle.code, engine: ENGINE_VERSION, snapshot: saveState(idle.state) }, 'idle');
    this.games.delete(idle.code);
    return true;
  }

  /** Creates a game, up to the cap. */
  ensure(code: string): LiveGame | null {
    const found = this.games.get(code);
    if (found) return found;
    if (this.games.size >= this.limits.liveGames && !this.evictIdle()) return null;
    const state = createGame(code, this.now());
    this.store.save(code, ENGINE_VERSION, saveState(state), 0, null);
    return this.live(state, 0, 0);
  }
}

export const IDLE_MS = 6 * 60 * 60_000;

export const newPlayerId = () => randomUUID().replace(/-/g, '').slice(0, 16) as PlayerId;
