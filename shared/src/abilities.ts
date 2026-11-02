// Where a player's abilities come from (design.md section 5.6). Derived from the assignment and setup fields, so the
// server and the Storyteller's screens agree; a new source (e.g. a role that gains abilities) is added here only.
import { ROLE_BY_ID } from './roles';
import type { WorldState } from './state';

export type AbilitySource = 'role' | 'believed' | 'philosopher' | 'cannibal' | 'lil_monsta';

export interface Ability {
  roleId: string;
  source: AbilitySource;
  /**
   * False for a believed role (the Drunk or Marionette wakes as it but has no ability), and for an ability eaten by a
   * player who only believes they are the Cannibal or ate an evil executee (the Cannibal thinks they have it).
   */
  real: boolean;
  /** The first night it applies. */
  fromNight: number;
}

/**
 * Roles whose ability the Cannibal is told they have, by name (official jinxes: "If the Cannibal gains the Butler
 * ability, the Cannibal learns this", and the same for the Zealot). Any other eaten ability stays hidden: its pickers
 * and results are titled "Cannibal" (abilityTitle).
 */
export const CANNIBAL_LEARNS: readonly string[] = ['butler', 'zealot'];

/** Whether the player has the Cannibal's ability by `night`, really (own role or a Philosopher's) or as a believed role. */
function cannibalHolder(w: WorldState, id: string, night: number): { real: boolean } | null {
  const a = w.assignments[id];
  if (!a) return null;
  if (a.roleId === 'cannibal') return { real: true };
  if (a.grantedAbility?.roleId === 'cannibal' && a.grantedAbility.fromNight <= night) return { real: true };
  if ((a.roleId === 'drunk' || a.roleId === 'marionette') && a.believedRoleId === 'cannibal') return { real: false };
  return null;
}

/**
 * The abilities a player has (or wakes as) on `night`, in waking order: their role (or the role they believe they
 * are), then a Philosopher's gained ability, then a Cannibal's eaten ability, then the Lil' Monsta token. Pass
 * Infinity for "now or later".
 */
export function abilitiesOf(w: WorldState, id: string, night: number): Ability[] {
  const a = w.assignments[id];
  if (!a || !a.roleId) return [];
  const out: Ability[] = [];
  if ((a.roleId === 'drunk' || a.roleId === 'marionette') && a.believedRoleId) {
    out.push({ roleId: a.believedRoleId, source: 'believed', real: false, fromNight: 0 });
  } else {
    out.push({ roleId: a.roleId, source: 'role', real: true, fromNight: 0 });
  }
  if (a.grantedAbility && a.grantedAbility.fromNight <= night) {
    out.push({ roleId: a.grantedAbility.roleId, source: 'philosopher', real: true, fromNight: a.grantedAbility.fromNight });
  }
  const eaten = a.eatenAbility;
  if (eaten && eaten.roleId && eaten.fromNight <= night) {
    const holder = cannibalHolder(w, id, night);
    if (holder) out.push({ roleId: eaten.roleId, source: 'cannibal', real: holder.real && !eaten.fake, fromNight: eaten.fromNight });
  }
  if (night >= 1 && w.setup.lilMonstaTokenHolderId === id && !out.some((x) => x.roleId === 'lil_monsta')) {
    out.push({ roleId: 'lil_monsta', source: 'lil_monsta', real: true, fromNight: 1 });
  }
  return out;
}

/**
 * Whether the player must not learn which role this ability is: an ability the Cannibal ate, unless it is one the
 * Cannibal learns (CANNIBAL_LEARNS). The one place that decides it; abilityTitle and abilityKey follow from it.
 */
export function hidesRole(ability: Pick<Ability, 'roleId' | 'source'>): boolean {
  return ability.source === 'cannibal' && !CANNIBAL_LEARNS.includes(ability.roleId);
}

/**
 * The title a player sees on the picker and result of an ability: `title` (by default the role's name), or
 * "Cannibal" when the role is hidden (hidesRole). The server passes every spec and result title through here.
 */
export function abilityTitle(ability: Pick<Ability, 'roleId' | 'source'>, title = ROLE_BY_ID[ability.roleId]?.name ?? ability.roleId): string {
  return hidesRole(ability) ? 'Cannibal' : title;
}

/**
 * How the Storyteller's screens name a result or question: the role's name, or "Cannibal (as Fortune Teller)" when the
 * player was shown another title (a hidden eaten ability).
 */
export function storytellerLabel(title: string, roleId: string): string {
  const name = ROLE_BY_ID[roleId]?.name ?? roleId;
  return title === name ? name : `${title} (as ${name})`;
}

/**
 * The role id an ability goes by in what the player receives (its picker's key and roleId, its submission, its
 * follow-up questions' key and spec): the role's own id, or "cannibal" when the role is hidden. Result rows and
 * questions keep the real role for the Storyteller. A player has at most one eaten ability, and the Cannibal itself
 * has no picker, so "cannibal" names exactly one ability.
 */
export function abilityKey(ability: Pick<Ability, 'roleId' | 'source'>): string {
  return hidesRole(ability) ? 'cannibal' : ability.roleId;
}
