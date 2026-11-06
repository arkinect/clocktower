// SQLite: the snapshot and command log of each game, sessions, and the archive of games that could not be restored.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { LogEntry } from '@ct/rules';

export interface SessionRow {
  hash: string;
  code: string;
  playerId: string;
  createdAt: number;
}

export interface GameRow {
  code: string;
  engine: number;
  snapshot: string;
}

export class Store {
  private db: Database.Database;
  private saveTx: (code: string, engine: number, snapshot: string, seq: number, entry: LogEntry | null) => void;

  constructor(dir: string | ':memory:') {
    if (dir !== ':memory:') fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dir === ':memory:' ? dir : path.join(dir, 'clocktower.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (code TEXT PRIMARY KEY, engine INTEGER NOT NULL, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (code TEXT NOT NULL, seq INTEGER NOT NULL, entry TEXT NOT NULL, PRIMARY KEY (code, seq));
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, code TEXT NOT NULL, player_id TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS archive (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, engine INTEGER, reason TEXT NOT NULL, snapshot TEXT NOT NULL, at INTEGER NOT NULL);
    `);
    const upsert = this.db.prepare(
      `INSERT INTO games (code, engine, snapshot) VALUES (?, ?, ?)
       ON CONFLICT (code) DO UPDATE SET engine = excluded.engine, snapshot = excluded.snapshot`,
    );
    const append = this.db.prepare('INSERT INTO commands (code, seq, entry) VALUES (?, ?, ?)');
    this.saveTx = this.db.transaction((code, engine, snapshot, seq, entry) => {
      upsert.run(code, engine, snapshot);
      if (entry) append.run(code, seq, JSON.stringify(entry));
    });
  }

  /** One transaction: the log can never get ahead of the snapshot, or behind it. */
  save(code: string, engine: number, snapshot: string, seq: number, entry: LogEntry | null) {
    this.saveTx(code, engine, snapshot, seq, entry);
  }

  games(): GameRow[] {
    return this.db.prepare('SELECT code, engine, snapshot FROM games').all() as GameRow[];
  }

  log(code: string): LogEntry[] {
    const rows = this.db.prepare('SELECT entry FROM commands WHERE code = ? ORDER BY seq').all(code) as {
      entry: string;
    }[];
    return rows.map((r) => JSON.parse(r.entry) as LogEntry);
  }

  logLength(code: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM commands WHERE code = ?').get(code) as { n: number };
    return row.n;
  }

  /** Moves a game aside, keeping only the newest archives so the disk cannot fill. */
  archive(row: GameRow, reason: string, now: number, keep: number) {
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO archive (code, engine, reason, snapshot, at) VALUES (?, ?, ?, ?, ?)')
        .run(row.code, row.engine, reason, row.snapshot, now);
      this.db.prepare('DELETE FROM games WHERE code = ?').run(row.code);
      this.db.prepare('DELETE FROM commands WHERE code = ?').run(row.code);
      this.db.prepare('DELETE FROM sessions WHERE code = ?').run(row.code);
      this.db
        .prepare('DELETE FROM archive WHERE id NOT IN (SELECT id FROM archive ORDER BY id DESC LIMIT ?)')
        .run(keep);
    })();
  }

  archived(): { code: string; reason: string }[] {
    return this.db.prepare('SELECT code, reason FROM archive ORDER BY id').all() as { code: string; reason: string }[];
  }

  sessions(): SessionRow[] {
    const rows = this.db.prepare('SELECT hash, code, player_id, created_at FROM sessions').all() as {
      hash: string;
      code: string;
      player_id: string;
      created_at: number;
    }[];
    return rows.map((r) => ({ hash: r.hash, code: r.code, playerId: r.player_id, createdAt: r.created_at }));
  }

  addSession(s: SessionRow) {
    this.db
      .prepare('INSERT INTO sessions (hash, code, player_id, created_at) VALUES (?, ?, ?, ?)')
      .run(s.hash, s.code, s.playerId, s.createdAt);
  }

  dropSessions(code: string, playerId: string) {
    this.db.prepare('DELETE FROM sessions WHERE code = ? AND player_id = ?').run(code, playerId);
  }

  close() {
    this.db.close();
  }
}
