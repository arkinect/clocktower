import { expect } from 'vitest';
import type { ActionChoice, GameState, Intent, Resolution } from '@ct/shared';
import { applyIntent, createGame, joinPlayer } from '../src/engine/game';

export interface TestGame {
  s: GameState;
  admin: string;
  /** role id -> player id */
  p: Record<string, string>;
  ids: string[];
}

let clock = 1_000_000;

export function act(g: TestGame, intent: Intent, actor = g.admin, seed = 42) {
  const r = applyIntent(g.s, actor, intent, { now: clock++, seed });
  if (!r.ok) throw new Error(`${intent.type}: ${r.error}`);
  g.s = r.state;
  return r;
}

export function tryAct(g: TestGame, intent: Intent, actor = g.admin) {
  const r = applyIntent(g.s, actor, intent, { now: clock++, seed: 42 });
  if (r.ok) g.s = r.state;
  return r;
}

/**
 * Build a game with the given roles seated in order (seat 0..n-1) and run setup to Night 0 collecting.
 * `extra` lets a test adjust setup before Night 0 begins.
 */
export function build(roles: string[], extra?: (g: TestGame) => void, seed = 42): TestGame {
  let s = createGame('t', 0);
  const a = joinPlayer(s, { name: 'Admin', rolePreference: 'none', wantsAdmin: true }, 'tok-admin', 0);
  if (!a.ok) throw new Error(a.error);
  s = a.state;
  const ids: string[] = [];
  roles.forEach((r, i) => {
    const j = joinPlayer(s, { name: `P${i}-${r}`, rolePreference: 'none', wantsAdmin: false }, `tok-${i}`, i + 1);
    if (!j.ok) throw new Error(j.error);
    s = j.state;
    ids.push(j.player.id);
  });
  const g: TestGame = { s, admin: a.player.id, p: {}, ids };
  act(g, { type: 'go_setup' });
  act(g, { type: 'set_seating', order: ids });
  roles.forEach((r, i) => {
    act(g, { type: 'assign_role', playerId: ids[i], roleId: r });
    g.p[r] = ids[i];
  });
  const spare = ['seamstress', 'juggler', 'artist', 'virgin', 'clockmaker', 'gambler'].filter((x) => !roles.includes(x));
  if (roles.includes('drunk')) act(g, { type: 'set_believed_role', playerId: g.p.drunk, roleId: spare.shift()! });
  if (roles.includes('marionette')) act(g, { type: 'set_believed_role', playerId: g.p.marionette, roleId: spare.shift()! });
  if (roles.includes('fortune_teller')) {
    const good = ids.find((id) => g.s.assignments[id].alignment === 'good' && id !== g.p.fortune_teller && g.s.assignments[id].roleId !== 'recluse')!;
    act(g, { type: 'set_red_herring', playerId: good });
  }
  if (roles.includes('mezepheles')) act(g, { type: 'set_mezepheles_word', word: 'teapot' });
  if (roles.includes('lil_monsta')) act(g, { type: 'set_lil_monsta_minion', roleId: ['poisoner', 'assassin', 'devils_advocate'].find((x) => !roles.includes(x))! });
  act(g, { type: 'suggest_bluffs' });
  extra?.(g);
  act(g, { type: 'begin_night0' }, g.admin, seed);
  act(g, { type: 'start_collecting' });
  return g;
}

/** Submit choices: key is a player id; value maps action key -> values (or 'decline'). */
export function submit(g: TestGame, choices: Record<string, Record<string, string[] | 'decline'>>) {
  for (const [pid, acts] of Object.entries(choices)) {
    const actions: Record<string, ActionChoice> = {};
    for (const [k, v] of Object.entries(acts)) actions[k] = v === 'decline' ? { decline: true, values: [] } : { values: v };
    act(g, { type: 'submit_night', actions }, pid);
  }
}

export function resolve(g: TestGame, choices: Record<string, string> = {}): Resolution {
  if (g.s.phase === 'NIGHT_COLLECTING') act(g, { type: 'resolve_night', force: true });
  for (const [k, v] of Object.entries(choices)) act(g, { type: 'choose_review', key: k, optionId: v });
  return g.s.night!.resolution!;
}

export function publishAndDay(g: TestGame) {
  act(g, { type: 'publish_night', force: true });
  expect(g.s.phase).toBe('DAY');
}

export function nextNight(g: TestGame, seed = 42) {
  act(g, { type: 'start_night' }, g.admin, seed);
}

export function resultFor(res: Resolution, pid: string, roleId?: string) {
  return res.results.find((r) => r.playerId === pid && (!roleId || r.roleId === roleId));
}

export function alive(g: TestGame, pid: string) {
  return g.s.players.find((p) => p.id === pid)!.alive;
}

/** Run a whole night: submit, resolve with choices, publish. */
export function runNight(g: TestGame, choices: Record<string, Record<string, string[] | 'decline'>>, review: Record<string, string> = {}) {
  submit(g, choices);
  const res = resolve(g, review);
  const final = g.s.night!.resolution!;
  publishAndDay(g);
  return { res, final };
}
