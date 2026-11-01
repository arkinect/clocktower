// SQLite persistence. The game state is stored as one JSON document per game (written on every change),
// plus an append-only event log (section 5.4).
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { GameState } from '@ct/shared';

export interface StoredEvent { seq: number; ts: number; actor: string | null; type: string; payload: unknown }

export class Store {
  private db: Database.Database;
  readonly file: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'clocktower.db');
    this.db = new Database(this.file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        game_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        actor TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (game_id, seq)
      );
    `);
  }

  loadAll(): GameState[] {
    return this.db.prepare('SELECT state FROM games').all().map((r) => JSON.parse((r as { state: string }).state) as GameState);
  }

  /** Saved games as raw JSON text, for the startup upgrade (server/src/upgrade.ts). */
  savedGames(): { gameId: string; code: string; state: string }[] {
    return this.db.prepare('SELECT game_id AS gameId, code, state FROM games').all() as { gameId: string; code: string; state: string }[];
  }

  /** A consistent copy of the whole database (works while it is open). */
  backupTo(file: string) {
    this.db.prepare('VACUUM INTO ?').run(file);
  }

  /** Runs fn in one transaction: everything it writes is rolled back if it throws. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  nextSeq(gameId: string): number {
    const r = this.db.prepare('SELECT MAX(seq) AS m FROM events WHERE game_id = ?').get(gameId) as { m: number | null };
    return (r.m ?? 0) + 1;
  }

  /** Time of the game's latest event other than a join or rebind (a reconnect is not progress), or null. */
  lastProgressAt(gameId: string): number | null {
    const r = this.db.prepare("SELECT MAX(ts) AS m FROM events WHERE game_id = ? AND type NOT IN ('join', 'rebind')").get(gameId) as { m: number | null };
    return r.m;
  }

  save(state: GameState, events: { seq: number; ts: number; actor: string | null; type: string; payload: unknown }[]) {
    const tx = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO games (game_id, code, state, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`)
        .run(state.id, state.code, JSON.stringify(state), Date.now());
      const ins = this.db.prepare('INSERT INTO events (game_id, seq, ts, actor, type, payload) VALUES (?, ?, ?, ?, ?, ?)');
      for (const e of events) ins.run(state.id, e.seq, e.ts, e.actor, e.type, JSON.stringify(e.payload ?? null));
    });
    tx();
  }

  events(gameId: string, limit = 500): StoredEvent[] {
    return (this.db.prepare('SELECT seq, ts, actor, type, payload FROM events WHERE game_id = ? ORDER BY seq DESC LIMIT ?').all(gameId, limit) as
      { seq: number; ts: number; actor: string | null; type: string; payload: string }[])
      .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  close() {
    this.db.close();
  }

  deleteGame(gameId: string) {
    this.db.prepare('DELETE FROM games WHERE game_id = ?').run(gameId);
    this.db.prepare('DELETE FROM events WHERE game_id = ?').run(gameId);
  }
}
