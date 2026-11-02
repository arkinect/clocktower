// Bring saved games from older schema versions up to date (design.md section 5.5).
import { ROLES, SCHEMA_VERSION, type GameState } from '@ct/shared';

export function migrate(raw: GameState): GameState {
  const s = raw as GameState & { schemaVersion?: number };
  const v = s.schemaVersion ?? 1;
  if (v < 2) {
    for (const r of ROLES) if (!(r.id in s.enabledRoles)) s.enabledRoles[r.id] = true;
    for (const p of s.players) {
      // v1 stored deadAt as a string such as "night 2": these count as "not today" everywhere.
      if (typeof p.deadAt === 'string' || p.deadAt === undefined) p.deadAt = null;
      if (p.deathCause === undefined) p.deathCause = null;
    }
    for (const d of Object.values(s.days)) if (!d.gossipStatement) d.gossipStatement = 'none';
    s.setup.godfatherOutsiders ??= null;
    s.setup.damselGuessUsed ??= false;
    s.setup.damselGuessResult ??= null;
    if (s.night?.resolution) {
      for (const p of s.night.resolution.after.players) {
        if (typeof p.deadAt === 'string' || p.deadAt === undefined) p.deadAt = null;
        if (p.deathCause === undefined) p.deathCause = null;
      }
    }
  }
  if (v < 3) {
    delete (s.settings as unknown as Record<string, unknown>).balloonistRevealsType;
    s.story ??= [];
  }
  if (v < 4) {
    s.publicDead ??= s.phase === 'LOBBY' || s.phase === 'SETUP' ? [] : s.players.filter((p) => !p.isAdmin && !p.alive).map((p) => p.id);
  }
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}
