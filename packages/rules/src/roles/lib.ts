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
