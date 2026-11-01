// Where a player's abilities come from (design.md section 5.6). Derived from the assignment and setup fields, so the
// server and the Storyteller's screens agree; a new source (e.g. a role that gains abilities) is added here only.
import type { WorldState } from './state';

export type AbilitySource = 'role' | 'believed' | 'philosopher' | 'lil_monsta';

export interface Ability {
  roleId: string;
  source: AbilitySource;
  /** False for a believed role: the Drunk or Marionette wakes as it but has no ability. */
  real: boolean;
  /** The first night it applies. */
  fromNight: number;
}

/**
 * The abilities a player has (or wakes as) on `night`, in waking order: their role (or the role they believe they
 * are), then a Philosopher's gained ability, then the Lil' Monsta token. Pass Infinity for "now or later".
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
  if (night >= 1 && w.setup.lilMonstaTokenHolderId === id && !out.some((x) => x.roleId === 'lil_monsta')) {
    out.push({ roleId: 'lil_monsta', source: 'lil_monsta', real: true, fromNight: 1 });
  }
  return out;
}
