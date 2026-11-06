// Read helpers over the world state. Pure functions, no mutation.
import { abilitiesOf, ROLE_BY_ID, type Alignment, type RoleType, type WorldState, type PlayerRec } from '@ct/shared';

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
 * Whether a player has the ability of `roleId` in the engine's eyes: their actual role (which always counts, even
 * for a Drunk or Marionette, whom abilitiesOf lists only as their believed role), or a real ability from abilitiesOf,
 * such as a Philosopher's gained ability once it is active. A believed role's ability never counts.
 */
export function hasAbility(w: WorldState, id: string, roleId: string, night: number): boolean {
  return roleIdOf(w, id) === roleId || abilitiesOf(w, id, night).some((x) => x.real && x.roleId === roleId);
}

/**
 * The night to check abilities against during the day, given the last night: the next one, since an ability gained
 * by now (a Philosopher's last night, a Cannibal's eat today) already works today. Impairment stays at the last night.
 */
export function abilityNightToday(lastNight: number): number {
  return lastNight + 1;
}

export function playersWithAbility(w: WorldState, roleId: string, night: number): string[] {
  return seatedIds(w).filter((id) => hasAbility(w, id, roleId, night));
}

export interface ChangeRoleOpts {
  /** Keep a Philosopher's gained ability, a Cannibal's eaten ability and "keeps ability when dead" (the Demon
   *  hand-over, the Huntsman's Damsel). */
  keepAbilities?: boolean;
  /** Keep the player's current alignment instead of the new role's natural one. */
  keepAlignment?: boolean;
  /** Keep the player's role memory (roleState) and the effects they caused. */
  keepTies?: boolean;
  /** Also clear the player's used-ability flags (the Storyteller reassigning a role mid-game). */
  clearFlags?: boolean;
}

/**
 * The one way to change a player's role (null = no role): appends to their history, sets the role and its natural
 * alignment (or keeps theirs, with keepAlignment), and clears their believed role. Unless `opts` keeps them, it also
 * clears their gained and eaten abilities, "keeps ability when dead", role memory and the effects they caused.
 */
export function changeRole(w: WorldState, pid: string, newRoleId: string | null, reason: string, now: number, opts: ChangeRoleOpts = {}) {
  const prev = w.assignments[pid];
  const eaten = opts.keepAbilities ? prev?.eatenAbility : undefined;
  w.assignments[pid] = {
    roleId: newRoleId,
    believedRoleId: null,
    alignment: opts.keepAlignment && prev ? prev.alignment : newRoleId ? ROLE_BY_ID[newRoleId].alignment : 'good',
    retainsAbilityWhenDead: opts.keepAbilities ? !!prev?.retainsAbilityWhenDead : false,
    grantedAbility: opts.keepAbilities ? prev?.grantedAbility ?? null : null,
    // Absent means none (the field is newer than schema v7), so it is left out rather than set to null.
    ...(eaten ? { eatenAbility: eaten } : {}),
    history: [...(prev?.history ?? []), { at: now, from: prev?.roleId ?? null, to: newRoleId, reason }],
  };
  if (!opts.keepTies) {
    delete w.roleState[pid];
    w.effects = w.effects.filter((e) => e.sourcePlayerId !== pid);
  }
  if (opts.clearFlags) delete w.flags[pid];
}

/** Start-information roles (RoleData.startInfo) this player has gained and not yet had the information for. */
export function startInfoPending(w: WorldState, pid: string): string[] {
  const v = w.roleState[pid]?.startInfoPending;
  return Array.isArray(v) ? (v as string[]) : [];
}

/**
 * Call when a player gains `roleId`'s ability other than at setup (the Philosopher's choice, the Huntsman's Damsel,
 * the Cannibal's eat). For a start-information role, marks it so the player wakes for it the first night the
 * ability is active and gets the information then (NightRun clears the mark). Any other role: nothing.
 */
export function markStartInfo(w: WorldState, pid: string, roleId: string) {
  if (!ROLE_BY_ID[roleId]?.startInfo) return;
  const list = startInfoPending(w, pid);
  if (!list.includes(roleId)) (w.roleState[pid] ??= {}).startInfoPending = [...list, roleId];
}

export function clearStartInfo(w: WorldState, pid: string, roleId: string) {
  const list = startInfoPending(w, pid);
  if (!list.includes(roleId)) return;
  const rest = list.filter((r) => r !== roleId);
  if (rest.length) w.roleState[pid].startInfoPending = rest;
  else delete w.roleState[pid].startInfoPending;
}

/** Role ids this player wakes as (believed role for Drunk/Marionette, gained ability, Lil' Monsta token). */
export function actingRoles(w: WorldState, id: string, night: number): string[] {
  return abilitiesOf(w, id, night).map((x) => x.roleId);
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
