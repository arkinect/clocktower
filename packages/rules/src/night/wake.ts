// Who wakes tonight, what they may submit, and server-side validation of it. Also Night resolution's memo.
import { clone } from '../util/clone';
import type { ActionSpec, Actions, Choice, PlayerId } from '@ct/protocol';
import { nightSheet } from '../abilities/registry';
import type { Instance } from '../abilities/define';
import type { GameState, NightPhase } from '../model/state';
import { Run, type Resolution } from './run';

const moment = (p: NightPhase) => ({ kind: 'night' as const, n: p.n });

/** A Run that only reads: the hooks it calls during collecting never change anything. */
function queryRun(state: GameState, phase: NightPhase, now = 0): Run {
  return new Run({ world: state, moment: moment(phase), seed: phase.seed, now, night: phase });
}

/** The abilities this player wakes for tonight, in night order, with or without input. */
export function wakingAbilities(state: GameState, pid: PlayerId): Instance[] {
  const phase = state.phase;
  if (phase.kind !== 'night') return [];
  const run = queryRun(state, phase);
  const out: Instance[] = [];
  for (const def of nightSheet(phase.n)) {
    if (!def.ability.resolve || def.flags.wakesOnNightDeath) continue;
    const a = run.reader.abilitiesOf(pid).find((x) => x.roleId === def.id && run.wakesNow(x, def));
    if (!a) continue;
    if (run.canAct(a, def) || def.ability.wakesDead?.(run.ctx(a))) out.push(a);
  }
  return out;
}

/** Real pickers for this player tonight. Empty means the client shows a decoy. */
export function actionSpecs(state: GameState, pid: PlayerId): ActionSpec[] {
  const phase = state.phase;
  if (phase.kind !== 'night') return [];
  const run = queryRun(state, phase);
  const out: ActionSpec[] = [];
  for (const a of wakingAbilities(state, pid)) {
    const draft = run.reader.role(a.roleId).ability.picker?.(run.ctx(a));
    if (draft) out.push(run.fullSpec(a, a.id, draft));
  }
  return out;
}

/**
 * The players the night waits for: those with a real choice to make. A drunk or poisoned player's picker is still real
 * to them, so they are waited for too. Everyone else sees a decoy, which they may submit but nobody waits on.
 */
export function expectedActors(state: GameState): PlayerId[] {
  const phase = state.phase;
  if (phase.kind !== 'night') return [];
  return queryRun(state, phase).reader.seated.filter((id) => actionSpecs(state, id).length > 0);
}

export function validateChoice(spec: ActionSpec, choice: Choice | undefined): string | null {
  if (!choice) return `${spec.title}: make a choice before submitting.`;
  if (choice.decline) return spec.allowDecline ? null : `${spec.title}: you must choose.`;
  if (choice.values.length !== spec.fields.length) return `${spec.title}: choose ${spec.fields.length} option(s).`;
  for (const [i, field] of spec.fields.entries()) {
    if (!field.options.includes(choice.values[i] as string)) {
      return `${spec.title}: "${field.label}" is not a legal choice.`;
    }
  }
  if (spec.distinct) {
    const picked = choice.values.filter((_, i) => spec.fields[i]?.kind === 'player');
    if (new Set(picked).size !== picked.length) return `${spec.title}: choose different players.`;
  }
  return null;
}

export type Validated = { ok: true; actions: Actions } | { ok: false; error: string };

/** Validates and normalises a submission. Whatever a non-actor sends is discarded. */
export function validateSubmission(state: GameState, pid: PlayerId, actions: Actions, partialOk = false): Validated {
  const clean: Actions = {};
  for (const spec of actionSpecs(state, pid)) {
    const choice = actions[spec.key];
    if (!choice && partialOk) continue;
    const error = validateChoice(spec, choice);
    if (error) return { ok: false, error };
    clean[spec.key] = choice?.decline ? { decline: true, values: [] } : { values: (choice as Choice).values.slice() };
  }
  return { ok: true, actions: clean };
}

const memo = new WeakMap<GameState, Resolution>();

/** Pure: the same state, seed and decisions give the same resolution. */
export function resolveNight(state: GameState): Resolution {
  const cached = memo.get(state);
  if (cached) return cached;
  const phase = state.phase;
  if (phase.kind !== 'night') throw new Error('Not a night.');
  const world = clone(state) as GameState;
  const run = new Run({ world, moment: moment(phase), seed: phase.seed, now: 0, start: state, night: phase });
  run.walk();
  const res = run.finish();
  memo.set(state, res);
  return res;
}

/** A command that can't change the night keeps the resolution already computed. */
export function carryResolution(from: GameState, to: GameState) {
  const res = memo.get(from);
  if (res && from !== to) memo.set(to, res);
}
