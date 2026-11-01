// App updates and saved games (design.md section 5.5). scripts/update.sh asks /api/upgrade-status whether a
// restart would interrupt a game; at startup, upgradeSavedGames brings older saves up to date.
import fs from 'fs';
import path from 'path';
import { SCHEMA_VERSION, type GameState, type Phase } from '@ct/shared';
import type { Store } from './db';
import { MIN_SUPPORTED_SCHEMA, STEPS, type MigrationStep, type SavedGame } from './engine/migrations';

/** A game that is not ENDED and has made no progress for this long counts as abandoned. */
export const ABANDONED_AFTER_MS = 4 * 60 * 60 * 1000;

/** Latest progress in a game: its last event other than join/rebind, else when it was created. */
export function lastProgress(store: Store, s: GameState): number {
  return store.lastProgressAt(s.id) ?? s.createdAt;
}

export function isAbandoned(lastProgressAt: number, now: number): boolean {
  return now - lastProgressAt >= ABANDONED_AFTER_MS;
}

export interface UpgradeStatus {
  schemaVersion: number;
  games: { code: string; phase: Phase; lastProgressAt: number; abandoned: boolean }[];
  safeToRestart: boolean;
}

/** Safe to restart when every game is ENDED or abandoned. No names, roles or other game details. */
export function upgradeStatus(store: Store, states: GameState[], now: number): UpgradeStatus {
  const games = states.map((s) => {
    const lastProgressAt = lastProgress(store, s);
    return { code: s.code, phase: s.phase, lastProgressAt, abandoned: s.phase !== 'ENDED' && isAbandoned(lastProgressAt, now) };
  });
  return { schemaVersion: SCHEMA_VERSION, games, safeToRestart: games.every((g) => g.phase === 'ENDED' || g.abandoned) };
}

// ---- startup upgrade --------------------------------------------------------------------------------

/** Startup must stop: the database is left exactly as it was. */
export class UpgradeRefused extends Error {}

export interface UpgradeOptions {
  now: number;
  /** Overridable for tests; default to this release's values. */
  schemaVersion?: number;
  minSupported?: number;
  steps?: Record<number, MigrationStep>;
}

export interface UpgradeResult {
  backupFile: string;
  games: { code: string; from: number; endedReason: 'abandoned' | 'update' | null }[];
}

/**
 * Brings every game saved at an older schema up to date, before GameManager loads them. Each older game is ended
 * first (if it isn't already), so migration steps only ever see ended games. Returns null when nothing was older.
 * Throws UpgradeRefused, changing nothing, when a game is too new or too old, or when any step fails.
 */
export function upgradeSavedGames(store: Store, opts: UpgradeOptions): UpgradeResult | null {
  const target = opts.schemaVersion ?? SCHEMA_VERSION;
  const minSupported = opts.minSupported ?? MIN_SUPPORTED_SCHEMA;
  const steps = opts.steps ?? STEPS;

  // 1. Check versions first, change nothing yet.
  const saved = store.savedGames().map((r) => {
    const s = JSON.parse(r.state) as SavedGame;
    return { ...r, s, from: typeof s.schemaVersion === 'number' ? s.schemaVersion : 1 };
  });
  const newest = Math.max(0, ...saved.map((g) => g.from));
  if (newest > target) {
    throw new UpgradeRefused(`This database has games saved at schema v${newest}, written by a newer release than this one `
      + `(schema v${target}). Upgrade the image, or restore the clocktower.db.pre-v${newest} backup made before that upgrade.`);
  }
  const older = saved.filter((g) => g.from < target);
  if (older.length === 0) return null;
  const oldest = Math.min(...older.map((g) => g.from));
  if (oldest < minSupported) {
    throw new UpgradeRefused(`This database has games saved at schema v${oldest}, older than this release supports. `
      + `Run v0.2.2 once to bring them to v4, then upgrade.`);
  }

  // 2. Back up once.
  const base = `${store.file}.pre-v${target}`;
  const backup = fs.existsSync(base) ? `${base}.${opts.now}` : base;
  store.backupTo(backup);

  // 3. End, migrate and save every older game in one transaction.
  const result: UpgradeResult = { backupFile: path.basename(backup), games: [] };
  store.transaction(() => {
    for (const { gameId, code, s, from } of older) {
      let endedReason: 'abandoned' | 'update' | null = null;
      if (s.phase !== 'ENDED') {
        const last = store.lastProgressAt(gameId) ?? s.createdAt;
        endedReason = isAbandoned(last, opts.now) ? 'abandoned' : 'update';
        s.phase = 'ENDED';
        s.nightEndsAt = null;
        s.night = null;
        s.endedReason = endedReason;
      }
      for (let v = from + 1; v <= target; v++) {
        const step = steps[v];
        try {
          if (!step) throw new Error('no such step');
          step(s);
        } catch (e) {
          throw new UpgradeRefused(`Upgrading game ${code} from schema v${from} failed at step v${v}: ${(e as Error).message}. `
            + 'Nothing was changed.');
        }
      }
      s.schemaVersion = target;
      store.save(s as GameState, [{ seq: store.nextSeq(gameId), ts: opts.now, actor: null, type: 'schema_migrated', payload: { from, to: target, endedReason } }]);
      result.games.push({ code, from, endedReason });
    }
  });
  return result;
}

/** The connection's own address (never X-Forwarded-For) is the loopback interface. */
export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
