// Read helpers over the world state. Pure functions, no mutation.
import { ROLE_BY_ID, type Alignment, type RoleType, type WorldState, type PlayerRec } from '@ct/shared';

export function seated(w: WorldState): PlayerRec[] {
  return w.players.filter((p) => !p.isAdmin && p.seat !== null).sort((a, b) => (a.seat! - b.seat!));
}

export function seatedIds(w: WorldState): string[] {
  return seated(w).map((p) => p.id);
}

export function aliveIds(w: WorldState): string[] {
  return seated(w).filter((p) => p.alive).map((p) => p.id);
}

export function getPlayer(w: WorldState, id: string): PlayerRec {
  const p = w.players.find((x) => x.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

export function findPlayer(w: WorldState, id: string | null | undefined): PlayerRec | undefined {
  return id ? w.players.find((x) => x.id === id) : undefined;
}

export function isAlive(w: WorldState, id: string): boolean {
  return !!findPlayer(w, id)?.alive;
}

export function nameOf(w: WorldState, id: string | null | undefined): string {
  return findPlayer(w, id)?.name ?? '(nobody)';
}

export function roleIdOf(w: WorldState, id: string): string | null {
  return w.assignments[id]?.roleId ?? null;
}

export function roleName(roleId: string | null | undefined): string {
  return roleId ? ROLE_BY_ID[roleId]?.name ?? roleId : '(none)';
}

export function typeOf(w: WorldState, id: string): RoleType | null {
  const r = roleIdOf(w, id);
  return r ? ROLE_BY_ID[r].type : null;
}

export function alignmentOf(w: WorldState, id: string): Alignment {
  return w.assignments[id]?.alignment ?? 'good';
}

/** Whoever is "the Demon": a player with a Demon role, or the Lil' Monsta token holder. */
export function isDemon(w: WorldState, id: string): boolean {
  return typeOf(w, id) === 'demon' || w.setup.lilMonstaTokenHolderId === id;
}

export function demonIds(w: WorldState): string[] {
  return seatedIds(w).filter((id) => isDemon(w, id));
}

export function minionIds(w: WorldState): string[] {
  return seatedIds(w).filter((id) => typeOf(w, id) === 'minion');
}

export function flag(w: WorldState, id: string, key: string): boolean {
  return !!w.flags[id]?.[key];
}

export function rs<T = unknown>(w: WorldState, id: string, key: string): T | undefined {
  return w.roleState[id]?.[key] as T | undefined;
}

/**
 * Whether a player has the ability of `roleId` in the engine's eyes: their actual role, or a Philosopher-gained
 * ability that is active by `night`. Drunk/Marionette never "have" their believed role's ability.
 */
export function hasAbility(w: WorldState, id: string, roleId: string, night: number): boolean {
  const a = w.assignments[id];
  if (!a) return false;
  if (a.roleId === roleId) return true;
  return !!a.grantedAbility && a.grantedAbility.roleId === roleId && a.grantedAbility.fromNight <= night;
}

export function playersWithAbility(w: WorldState, roleId: string, night: number): string[] {
  return seatedIds(w).filter((id) => hasAbility(w, id, roleId, night));
}

/** Role ids this player wakes as (believed role for Drunk/Marionette, gained ability, Lil' Monsta token). */
export function actingRoles(w: WorldState, id: string, night: number): string[] {
  const a = w.assignments[id];
  if (!a || !a.roleId) return [];
  const out: string[] = [];
  if ((a.roleId === 'drunk' || a.roleId === 'marionette') && a.believedRoleId) out.push(a.believedRoleId);
  else out.push(a.roleId);
  if (a.grantedAbility && a.grantedAbility.fromNight <= night) out.push(a.grantedAbility.roleId);
  if (night >= 1 && w.setup.lilMonstaTokenHolderId === id && !out.includes('lil_monsta')) out.push('lil_monsta');
  return out;
}

export function canAct(w: WorldState, id: string): boolean {
  const p = findPlayer(w, id);
  return !!p && (p.alive || !!w.assignments[id]?.retainsAbilityWhenDead);
}

/** Nearest alive player on each side, skipping dead seats and the player. [left(counter-clockwise), right]. */
export function aliveNeighbours(w: WorldState, id: string): string[] {
  const order = seatedIds(w);
  const i = order.indexOf(id);
  if (i < 0) return [];
  const n = order.length;
  const found: string[] = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const cand = order[(i + dir * k + n * k) % n];
      if (cand !== id && isAlive(w, cand)) {
        found.push(cand);
        break;
      }
    }
  }
  if (found.length === 2 && found[0] === found[1]) return [found[0]];
  return found;
}

/** Nearest alive player matching `pred` on each side (going past non-matching and dead players). */
export function nearestAliveMatching(w: WorldState, id: string, pred: (pid: string) => boolean): string[] {
  const order = seatedIds(w);
  const i = order.indexOf(id);
  if (i < 0) return [];
  const n = order.length;
  const found: string[] = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const cand = order[(i + dir * k + n * k) % n];
      if (cand !== id && isAlive(w, cand) && pred(cand)) {
        found.push(cand);
        break;
      }
    }
  }
  return [...new Set(found)];
}

/** Seats between two players the shorter way around (adjacent = 1), counting every seat. */
export function seatDistance(w: WorldState, a: string, b: string): number {
  const order = seatedIds(w);
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  const d = Math.abs(i - j);
  return Math.min(d, order.length - d);
}

export function areNeighbours(w: WorldState, a: string, b: string): boolean {
  return seatDistance(w, a, b) === 1;
}

export function inPlayRoleIds(w: WorldState): string[] {
  return seatedIds(w).map((id) => roleIdOf(w, id)).filter((x): x is string => !!x);
}
