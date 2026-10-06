// Shared life/death bookkeeping used by the night engine and Day panel actions.
import type { WorldState } from '@ct/shared';
import { computeImpairment } from './impairment';
import { aliveNeighbours, alignmentOf, findPlayer, flag, hasAbility, playersWithAbility } from './world';

/**
 * Bring a dead player back with the same role (Professor, Shabaloth, Admin "mark alive").
 * Does not fire any death trigger. Callers send the "You are alive again" notice.
 */
export function revivePlayer(w: WorldState, pid: string): boolean {
  const p = findPlayer(w, pid);
  if (!p || p.alive) return false;
  p.alive = true;
  p.deadAt = null;
  p.deathCause = null;
  p.ghostVoteUsed = false;
  w.setup.shabalothKills = w.setup.shabalothKills.filter((x) => x !== pid);
  const a = w.assignments[pid];
  if (a) a.retainsAbilityWhenDead = false;
  const r = w.roleState[pid];
  if (r) { delete r.soberAtDeath; }
  return true;
}

export interface DayKillPreview { wouldDie: boolean; reason: string; usesFool: boolean }

/**
 * design.md section 5.12: a day kill runs the normal protections except the Mayor bounce and the
 * Innkeeper (both night only). Pure: the caller applies the outcome after the Admin confirms.
 */
export function previewDayKill(w: WorldState, target: string, night: number): DayKillPreview {
  const p = findPlayer(w, target);
  if (!p || !p.alive) return { wouldDie: false, reason: `${p?.name ?? 'That player'} is already dead.`, usesFool: false };
  const imp = computeImpairment(w, night);
  const sober = (id: string) => !imp[id]?.impaired;
  if (hasAbility(w, target, 'sailor', night) && sober(target)) return { wouldDie: false, reason: `${p.name} cannot die because they are a sober Sailor.`, usesFool: false };
  for (const tl of playersWithAbility(w, 'tea_lady', night)) {
    if (!findPlayer(w, tl)?.alive || !sober(tl)) continue;
    const nb = aliveNeighbours(w, tl);
    if (nb.length === 2 && nb.includes(target) && nb.every((x) => alignmentOf(w, x) === 'good')) {
      return { wouldDie: false, reason: `${p.name} cannot die: neighbour of the Tea Lady (${findPlayer(w, tl)!.name}).`, usesFool: false };
    }
  }
  if (hasAbility(w, target, 'fool', night) && !flag(w, target, 'fool_used') && sober(target)) {
    return { wouldDie: false, reason: `${p.name} survives: the Fool's first death (this uses the Fool).`, usesFool: true };
  }
  return { wouldDie: true, reason: `${p.name} would die.`, usesFool: false };
}
