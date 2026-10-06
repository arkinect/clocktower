// Demon hand-over helpers shared by the night engine and Day panel actions.
import { ROLE_BY_ID, type WorldState } from '@ct/shared';
import { nameOf, roleIdOf, roleName, seatedIds, typeOf } from './world';

/** Make `pid` the Demon in place of `oldDemon` (Scarlet Woman or starpass). */
export function becomeDemon(w: WorldState, pid: string, oldDemon: string, notify: (pid: string, title: string, lines: string[]) => void) {
  const a = w.assignments[pid];
  if (w.setup.lilMonstaTokenHolderId === oldDemon) {
    w.setup.lilMonstaTokenHolderId = pid;
    notify(pid, 'Lil\' Monsta', ['You hold Lil\' Monsta\'s token. You are the Demon.']);
    return;
  }
  const newRole = roleIdOf(w, oldDemon)!;
  const from = a.roleId;
  a.history.push({ at: Date.now(), from, to: newRole, reason: 'became the Demon' });
  a.roleId = newRole;
  a.believedRoleId = null;
  a.alignment = 'evil';
  notify(pid, `You are now the ${roleName(newRole)}`, [ROLE_BY_ID[newRole].abilityText, ...demonInfoLines(w, pid)]);
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

