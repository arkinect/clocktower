// App updates and saved games (design.md section 5.5). scripts/update.sh asks /api/upgrade-status whether a
// restart would interrupt a game.
import { SCHEMA_VERSION, type GameState, type Phase } from '@ct/shared';
import type { Store } from './db';

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

/** The connection's own address (never X-Forwarded-For) is the loopback interface. */
export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
