// Small helpers the role files share. Nothing here names a role.
import type { ActionField, PlayerId } from '@ct/protocol';
import type { DayActionOutcome, SpecDraft } from '../abilities/define';
import { roleDef } from '../abilities/registry';
import type { AbilityCtx } from '../night/context';

/** A picker of `count` players. Distinct by default. */
export function choosePlayers(
  title: string,
  prompt: string,
  count: number,
  options: readonly string[],
  o: { distinct?: boolean; decline?: string } = {},
): SpecDraft {
  const fields: ActionField[] = Array.from({ length: count }, (_, i) => ({
    kind: 'player',
    label: count > 1 ? `Player ${i + 1}` : 'Player',
    options: [...options],
  }));
  return {
    title,
    prompt,
    fields,
    distinct: o.distinct ?? true,
    ...(o.decline ? { allowDecline: true, declineLabel: o.decline } : {}),
  };
}

export const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

/** The confirmation a once-per-game choice gives back. */
export const confirmChoice = (ctx: AbilityCtx<unknown>, target: PlayerId) =>
  ctx.inform({ truth: [`You chose ${ctx.name(target)}.`] });

/** Makes `to` the Demon in place of `from`: a token moves, a character is copied. Gained abilities stay. */
export function handOverDemon(ctx: AbilityCtx<unknown>, to: PlayerId, from: PlayerId, pending = false) {
  const src = ctx.demonSource(from);
  if (!src) return;
  const options = { pending };
  if (src.kind === 'ability') {
    ctx.move(src.id, to);
    const name = ctx.role(ctx.instance(src.id)?.roleId ?? ctx.ability.roleId).name;
    ctx.notify(to, name, [`You hold ${name}'s token. You are the Demon.`], options);
    return;
  }
  ctx.changeCharacter(to, src.role, {
    reason: 'became the Demon',
    alignment: 'natural',
    keepGranted: true,
    keepTies: true,
  });
  const def = roleDef(src.role);
  ctx.notify(to, `You are now the ${def.name}`, [def.abilityText, ...ctx.demonInfo(to)], options);
}

export function outcomeOfKill(ctx: AbilityCtx<unknown>, target: PlayerId, died: boolean): DayActionOutcome {
  const why = ctx.run.log.at(-1);
  return { summary: why ?? `${ctx.name(target)} ${died ? 'dies' : 'survives'}.`, effective: died };
}

/** A day kill: runs the protections, or the Storyteller's override of them. */
export function dayKill(
  ctx: AbilityCtx<unknown>,
  target: PlayerId,
  cause: string,
  force: 'none' | 'success' | 'fail',
): DayActionOutcome {
  if (force === 'success') {
    ctx.forceKill(target, cause);
    return { summary: `${ctx.name(target)} dies (forced).`, effective: true };
  }
  if (force === 'fail') return { summary: `${ctx.name(target)} survives (forced).`, effective: false };
  return outcomeOfKill(ctx, target, ctx.attemptKill(target, cause));
}

/** A character who is drunk for as long as they are this character. */
export function drunkFromTheStart(ctx: AbilityCtx<unknown>) {
  if (ctx.ability.origin.kind === 'character' && !ctx.believed) {
    ctx.addCondition(ctx.holder, 'drunk', { until: 'removed' });
  }
}

export function soberOnChange(ctx: AbilityCtx<unknown>) {
  for (const c of ctx.conditionsFrom('drunk')) ctx.removeCondition(c);
}

/**
 * A day action confirmed today, kept so the Day tab shows it confirmed and a second Use takes it back. `died`: the
 * target died of it, so taking it back revives them.
 */
export interface Confirmed {
  day: number;
  target: PlayerId;
  died: boolean;
}

/** The confirmation, if it was today. */
export const confirmedToday = (ctx: AbilityCtx<unknown>, c: Confirmed | null | undefined): Confirmed | null =>
  c && c.day === ctx.n ? c : null;

/** Runs a day action that may kill `target`, and records what it did. */
export function confirmKill(
  ctx: AbilityCtx<unknown>,
  target: PlayerId,
  act: () => DayActionOutcome,
): { outcome: DayActionOutcome; confirmed: Confirmed } {
  const wasAlive = ctx.isAlive(target);
  const outcome = act();
  return { outcome, confirmed: { day: ctx.n, target, died: wasAlive && !ctx.isAlive(target) } };
}

/** Takes a confirmed day action back: whoever died of it lives again. */
export function takeBack(ctx: AbilityCtx<unknown>, c: Confirmed | null, what: string): DayActionOutcome {
  if (!c) return { summary: 'Nothing to take back.', effective: false };
  if (c.died && !ctx.isAlive(c.target)) ctx.revive(c.target, `the ${what} was taken back`);
  return { summary: `Taken back${c.died ? `: ${ctx.name(c.target)} is alive` : ''}.`, effective: true };
}
