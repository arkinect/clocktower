// Section 11: what a player may submit tonight, and server-side validation of it.
import type { ActionChoice, ActionSpec, GameState } from '@ct/shared';
import { BEHAVIOURS, type SpecCtx } from './roles';
import { nightOrder } from './night';
import { actingRoles, canAct, seatedIds } from './world';

/** Role ids (slots) this player wakes for tonight, in night order, with or without input. */
export function wakingRoles(state: GameState, pid: string): string[] {
  const night = state.night;
  if (!night || !canAct(state, pid)) return [];
  const acting = actingRoles(state, pid, night.number);
  const out: string[] = [];
  for (const slot of nightOrder(night.number)) {
    if (!slot.roleId || slot.roleId === 'ravenkeeper' || !acting.includes(slot.roleId)) continue;
    const b = BEHAVIOURS[slot.roleId];
    if (!b?.resolve) continue;
    const ctx: SpecCtx = { w: state, pid, night: night.number, state };
    if (b.wakes && !b.wakes(ctx)) continue;
    if (!out.includes(slot.roleId)) out.push(slot.roleId);
  }
  return out;
}

/** Real pickers for this player tonight. Empty means the client shows a decoy picker. */
export function actionSpecs(state: GameState, pid: string): ActionSpec[] {
  const night = state.night;
  if (!night) return [];
  const out: ActionSpec[] = [];
  for (const roleId of wakingRoles(state, pid)) {
    const spec = BEHAVIOURS[roleId].spec?.({ w: state, pid, night: night.number, state });
    if (!spec) continue;
    // A field with no legal option (e.g. nobody else alive) must still be submittable.
    const playerFields = spec.fields.filter((f) => f.kind === 'player');
    const pool = new Set(playerFields.flatMap((f) => f.options));
    if (spec.fields.some((f) => f.options.length === 0) || (spec.distinct && pool.size < playerFields.length)) {
      spec.allowDecline = true;
      spec.declineLabel ??= 'No legal choice';
    }
    out.push(spec);
  }
  return out;
}

export function ravenkeeperSpec(state: GameState): ActionSpec {
  return {
    key: 'ravenkeeper', roleId: 'ravenkeeper', title: 'Ravenkeeper', prompt: 'You have died. Choose a player: you learn their character.',
    fields: [{ kind: 'player', label: 'Player', options: seatedIds(state) }], distinct: false, allowDecline: false,
  };
}

export function validateChoice(spec: ActionSpec, choice: ActionChoice | undefined): string | null {
  if (!choice) return `${spec.title}: make a choice before submitting.`;
  if (choice.decline) return spec.allowDecline ? null : `${spec.title}: you must choose.`;
  if (!Array.isArray(choice.values) || choice.values.length !== spec.fields.length) return `${spec.title}: choose ${spec.fields.length} option(s).`;
  for (let i = 0; i < spec.fields.length; i++) {
    if (typeof choice.values[i] !== 'string' || !spec.fields[i].options.includes(choice.values[i])) return `${spec.title}: "${spec.fields[i].label}" is not a legal choice.`;
  }
  if (spec.distinct) {
    const ps = choice.values.filter((_, i) => spec.fields[i].kind === 'player');
    if (new Set(ps).size !== ps.length) return `${spec.title}: choose different players.`;
  }
  return null;
}

/** Validate and normalise a submission. Non-actors' content is discarded (acknowledgement only). */
export function validateSubmission(state: GameState, pid: string, actions: Record<string, ActionChoice>, partialOk = false):
  { ok: true; actions: Record<string, ActionChoice> } | { ok: false; error: string } {
  const specs = actionSpecs(state, pid);
  const clean: Record<string, ActionChoice> = {};
  for (const spec of specs) {
    const choice = actions?.[spec.key];
    if (!choice && partialOk) continue;
    const err = validateChoice(spec, choice);
    if (err) return { ok: false, error: err };
    clean[spec.key] = choice.decline ? { decline: true, values: [] } : { values: choice.values.slice() };
  }
  return { ok: true, actions: clean };
}
