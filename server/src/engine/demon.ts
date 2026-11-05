// Demon hand-over helpers shared by the night engine and Day panel actions.
import { ROLE_BY_ID, jinxBetween, jinxLabel, type WorldState } from '@ct/shared';
import { aliveIds, changeRole, isDemon, nameOf, roleIdOf, roleName, seatedIds, typeOf } from './world';

/** Make `pid` the Demon in place of `oldDemon` (Scarlet Woman or starpass). */
export function becomeDemon(w: WorldState, pid: string, oldDemon: string, now: number, notify: (pid: string, title: string, lines: string[]) => void) {
  if (w.setup.lilMonstaTokenHolderId === oldDemon) {
    w.setup.lilMonstaTokenHolderId = pid;
    notify(pid, 'Lil\' Monsta', ['You hold Lil\' Monsta\'s token. You are the Demon.']);
    return;
  }
  const newRole = roleIdOf(w, oldDemon)!;
  // A hand-over: the new Demon keeps any gained ability, memory and effects.
  changeRole(w, pid, newRole, 'became the Demon', now, { keepAbilities: true, keepTies: true });
  notify(pid, `You are now the ${roleName(newRole)}`, [ROLE_BY_ID[newRole].abilityText, ...demonInfoLines(w, pid)]);
}

/**
 * Jinx (Scarlet Woman & Al-Hadikhia): "If there would be two Demons, one of which was the Scarlet Woman, the Scarlet
 * Woman becomes the Scarlet Woman again." Checked after any revive. Returns the player who changed back, if any.
 */
export function scarletWomanAgain(w: WorldState, now: number, notify: (pid: string, title: string, lines: string[]) => void): string | null {
  const demons = aliveIds(w).filter((id) => isDemon(w, id));
  const was = demons.find((id) => w.assignments[id]?.history.some((h) => h.from === 'scarlet_woman' && h.to === roleIdOf(w, id)));
  if (!was || !demons.some((id) => id !== was && roleIdOf(w, id) === 'al_hadikhia')) return null;
  changeRole(w, was, 'scarlet_woman', 'a second Demon came back', now, { keepAbilities: true, keepTies: true });
  notify(was, `${jinxLabel(jinxBetween('scarlet_woman', 'al_hadikhia')!)}: You are the Scarlet Woman again`, [ROLE_BY_ID.scarlet_woman.abilityText]);
  return was;
}

export function demonInfoLines(w: WorldState, demonId: string): string[] {
  const minions = seatedIds(w).filter((id) => id !== demonId && typeOf(w, id) === 'minion');
  const marionette = minions.filter((id) => roleIdOf(w, id) === 'marionette');
  const lines = [minions.length ? `Your Minions: ${minions.map((m) => nameOf(w, m)).join(', ')}` : 'You have no Minions.'];
  if (marionette.length) lines.push(`The Marionette is: ${marionette.map((m) => nameOf(w, m)).join(', ')}`);
  if (w.setup.demonBluffs.length) lines.push(`Not in play (bluffs): ${w.setup.demonBluffs.map(roleName).join(', ')}`);
  lines.push('Tell your Minions who you are in person.');
  return lines;
}

