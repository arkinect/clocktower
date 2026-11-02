// Section 7: type counts, suggestions and the setup checklist.
import { ROLE_BY_ID, ROLE_TYPES, TYPE_CHART, type GameState, type RoleType } from '@ct/shared';
import type { Rng } from './rng';
import { areNeighbours, demonIds, inPlayRoleIds, roleIdOf, seated, seatedIds, typeOf } from './world';

export type Counts = [number, number, number, number];

export function enabledRoles(state: GameState): string[] {
  return Object.keys(state.enabledRoles).filter((r) => state.enabledRoles[r] && ROLE_BY_ID[r]);
}

export function enabledOfType(state: GameState, t: RoleType): string[] {
  return enabledRoles(state).filter((r) => ROLE_BY_ID[r].type === t);
}

function clampChart(n: number): Counts {
  const k = Math.max(5, Math.min(15, n));
  const base = TYPE_CHART[k].slice() as Counts;
  if (n !== k) base[0] += n - k; // outside 5-15: Townsfolk absorb the difference
  return base;
}

/** Target counts: Admin override, or default chart plus modifiers of `roleIds` (the roles assigned or proposed). */
export function targetCounts(state: GameState, playerCount: number, roleIds: string[]): { counts: Counts; source: 'default' | 'override' } {
  if (state.setup.typeCountsOverride) return { counts: state.setup.typeCountsOverride.slice() as Counts, source: 'override' };
  const c = clampChart(playerCount);
  const chartOutsiders = c[1];
  for (const r of roleIds) {
    if (r === 'godfather') {
      // -1 or +1 Outsider, Admin's choice (default +1); only +1 when the chart has no Outsiders.
      const d = state.setup.godfatherOutsiders === -1 && chartOutsiders > 0 ? -1 : 1;
      c[1] += d; c[0] -= d;
      continue;
    }
    const m = ROLE_BY_ID[r]?.setupModifier;
    if (!m) continue;
    if (m.outsiders) { c[1] += m.outsiders; c[0] -= m.outsiders; }
    if (m.minions) { c[2] += m.minions; c[0] -= m.minions; }
  }
  for (let i = 0; i < 4; i++) c[i] = Math.max(0, c[i]);
  return { counts: c, source: 'default' };
}

export function actualCounts(state: GameState): Counts {
  const c: Counts = [0, 0, 0, 0];
  for (const id of seatedIds(state)) {
    const t = typeOf(state, id);
    if (t) c[ROLE_TYPES.indexOf(t)]++;
  }
  return c;
}

/** Random role assignment that respects target counts and modifiers (section 7.3). Returns playerId -> roleId. */
export function suggestDistribution(state: GameState, rng: Rng): Record<string, string> | { error: string } {
  const ids = seatedIds(state);
  const n = ids.length;
  if (n === 0) return { error: 'Seat players first.' };
  for (let attempt = 0; attempt < 50; attempt++) {
    const demon = rng.pick(enabledOfType(state, 'demon').length ? enabledOfType(state, 'demon') : ['']);
    if (!demon) return { error: 'No Demon is enabled.' };
    const picked = [demon];
    let { counts } = targetCounts(state, n, picked);
    const minionPool = rng.shuffle(enabledOfType(state, 'minion'));
    const minions = minionPool.slice(0, counts[2]);
    picked.push(...minions);
    ({ counts } = targetCounts(state, n, picked));
    // Pick townsfolk; a Balloonist changes the outsider count so recompute after.
    const townPool = rng.shuffle(enabledOfType(state, 'townsfolk'));
    let towns = townPool.slice(0, counts[0]);
    ({ counts } = targetCounts(state, n, [...picked, ...towns]));
    towns = townPool.slice(0, counts[0]);
    const outsiders = rng.shuffle(enabledOfType(state, 'outsider')).slice(0, counts[1]);
    // The Huntsman needs the Damsel in play.
    if (towns.includes('huntsman') && !outsiders.includes('damsel')) {
      if (outsiders.length && state.enabledRoles.damsel) outsiders[0] = 'damsel';
      else {
        const spare = townPool.find((r) => !towns.includes(r));
        if (!spare) continue;
        towns[towns.indexOf('huntsman')] = spare;
      }
    }
    const all = [...picked, ...towns, ...outsiders];
    if (all.length !== n) continue;
    if (all.includes('vigormortis') && all.includes('scarlet_woman')) continue; // owner rule: never together
    if (minions.length < counts[2]) continue;
    const shuffled = rng.shuffle(all);
    return Object.fromEntries(ids.map((id, i) => [id, shuffled[i]]));
  }
  return { error: 'Not enough enabled roles of each type for this player count.' };
}

/** Good roles that are not in play and not anyone's believed role. */
export function bluffCandidates(state: GameState): string[] {
  const inPlay = new Set(inPlayRoleIds(state));
  for (const id of seatedIds(state)) {
    const b = state.assignments[id]?.believedRoleId;
    if (b) inPlay.add(b);
  }
  return enabledRoles(state).filter((r) => ROLE_BY_ID[r].alignment === 'good' && !inPlay.has(r));
}

export function suggestBluffs(state: GameState, rng: Rng): string[] {
  const c = bluffCandidates(state);
  const towns = rng.shuffle(c.filter((r) => ROLE_BY_ID[r].type === 'townsfolk'));
  const outs = rng.shuffle(c.filter((r) => ROLE_BY_ID[r].type === 'outsider'));
  return [...towns, ...outs].slice(0, 3);
}

export function redHerringCandidates(state: GameState): string[] {
  return seatedIds(state).filter((id) => {
    const r = roleIdOf(state, id);
    return state.assignments[id]?.alignment === 'good' && r !== 'fortune_teller' && r !== 'recluse' && r !== 'drunk';
  });
}

export interface CheckItem { id: string; label: string; done: boolean; blocking: boolean }

export function setupChecklist(state: GameState): CheckItem[] {
  const ids = seatedIds(state);
  const inPlay = inPlayRoleIds(state);
  const items: CheckItem[] = [];
  const unassigned = ids.filter((id) => !roleIdOf(state, id));
  const unseated = state.players.filter((p) => !p.isAdmin && p.seat === null);
  items.push({ id: 'seated', label: unseated.length ? `Seat everyone (${unseated.length} unseated)` : 'Everyone is seated', done: unseated.length === 0 && ids.length > 0, blocking: true });
  items.push({ id: 'roles', label: unassigned.length ? `Assign a role to every seated player (${unassigned.length} left)` : 'Every seated player has a role', done: ids.length > 0 && unassigned.length === 0, blocking: true });
  items.push({ id: 'demon', label: 'Exactly one Demon is assigned', done: demonIds(state).length === 1, blocking: false });
  for (const id of ids) {
    const r = roleIdOf(state, id);
    const name = state.players.find((p) => p.id === id)!.name;
    if (r === 'drunk') {
      const b = state.assignments[id].believedRoleId;
      items.push({ id: `drunk:${id}`, label: `Choose the Drunk's believed Townsfolk (${name})`, done: !!b && ROLE_BY_ID[b]?.type === 'townsfolk' && !inPlay.includes(b), blocking: true });
    }
    if (r === 'marionette') {
      const b = state.assignments[id].believedRoleId;
      items.push({ id: `marionette:${id}`, label: `Choose the Marionette's believed good role (${name})`, done: !!b && ROLE_BY_ID[b]?.alignment === 'good' && !inPlay.includes(b), blocking: true });
    }
  }
  if (inPlay.includes('fortune_teller')) {
    const rh = state.setup.redHerringId;
    items.push({ id: 'red_herring', label: 'Choose the Fortune Teller\'s red herring (a good player)', done: !!rh && ids.includes(rh) && state.assignments[rh]?.alignment === 'good', blocking: true });
  }
  if (inPlay.includes('godfather')) {
    items.push({ id: 'godfather', label: `Godfather: Outsiders -1 or +1${state.setup.godfatherOutsiders ? ` (chosen: ${state.setup.godfatherOutsiders > 0 ? '+1' : '-1'})` : ''}`, done: state.setup.godfatherOutsiders !== null, blocking: true });
  }
  if (inPlay.includes('huntsman')) {
    items.push({ id: 'huntsman', label: 'Huntsman needs the Damsel in play', done: inPlay.includes('damsel'), blocking: true });
  }
  const bluffs = state.setup.demonBluffs;
  const cands = bluffCandidates(state);
  items.push({ id: 'bluffs', label: 'Choose 3 Demon bluffs (good roles not in play)', done: bluffs.length === 3 && new Set(bluffs).size === 3 && bluffs.every((b) => cands.includes(b)), blocking: true });
  if (inPlay.includes('mezepheles')) items.push({ id: 'word', label: 'Set the Mezepheles secret word', done: !!state.setup.mezephelesWord, blocking: true });
  if (inPlay.includes('lil_monsta')) {
    const m = state.setup.lilMonstaMinionRole;
    items.push({ id: 'lil_monsta', label: 'Choose the Minion role the Lil\' Monsta player becomes', done: !!m && ROLE_BY_ID[m]?.type === 'minion' && !inPlay.includes(m), blocking: true });
  }
  return items;
}

export function setupWarnings(state: GameState): string[] {
  const out: string[] = [];
  const ids = seatedIds(state);
  const n = ids.length;
  if (n && (n < 5 || n > 15)) out.push(`${n} players seated: the normal range is 5 to 15.`);
  if (!enabledOfType(state, 'demon').length) out.push('No Demon is enabled. The game cannot start.');
  const allAssigned = n > 0 && ids.every((id) => roleIdOf(state, id));
  const { counts } = targetCounts(state, n, inPlayRoleIds(state));
  const actual = actualCounts(state);
  for (let i = 0; i < 4; i++) {
    if (enabledOfType(state, ROLE_TYPES[i]).length < counts[i]) out.push(`Only ${enabledOfType(state, ROLE_TYPES[i]).length} ${ROLE_TYPES[i]} roles enabled but ${counts[i]} needed.`);
  }
  if (allAssigned && actual.some((v, i) => v !== counts[i])) out.push(`Assigned types (${actual.join('/')}) differ from target (${counts.join('/')}) Townsfolk/Outsider/Minion/Demon.`);
  const demons = demonIds(state);
  for (const id of ids) {
    if (roleIdOf(state, id) === 'marionette' && demons.length && !demons.some((d) => areNeighbours(state, d, id))) {
      out.push(`The Marionette (${state.players.find((p) => p.id === id)!.name}) does not sit next to the Demon.`);
    }
  }
  const inPlayNow = inPlayRoleIds(state);
  if (inPlayNow.includes('vigormortis') && inPlayNow.includes('scarlet_woman')) {
    out.push('The Vigormortis and the Scarlet Woman are both in play. These two should not be in the same game: there are known bugs around this combination.');
  }
  if (allAssigned && demons.length !== 1) out.push(`${demons.length} Demons assigned. Normally there is exactly one.`);
  const unseated = state.players.filter((p) => !p.isAdmin && p.seat === null).length;
  if (unseated) out.push(`${unseated} player(s) are not seated. Unseated players take no part.`);
  void seated;
  return out;
}
