// Small helpers the role files share. Nothing here names a role.
import type { Alignment, PlayerId } from '@ct/protocol';
import type { DayActionDraft, DayActionOutcome, DraftField, SpecDraft } from '../abilities/define';
import { roleDef } from '../abilities/registry';
import type { AbilityCtx } from '../night/context';

/** A picker of `count` players, labelled by kind ("Player 2"). Distinct by default. */
export function choosePlayers(
  title: string,
  prompt: string,
  count: number,
  options: readonly string[],
  o: { distinct?: boolean; decline?: string } = {},
): SpecDraft {
  const fields: DraftField[] = Array.from({ length: count }, () => ({ kind: 'player', options: [...options] }));
  return {
    title,
    prompt,
    fields,
    distinct: o.distinct ?? true,
    ...(o.decline ? { allowDecline: true, declineLabel: o.decline } : {}),
  };
}

/** The confirmation a once-per-game choice gives back. */
export const confirmChoice = (ctx: AbilityCtx<unknown>, target: PlayerId) =>
  ctx.tell([`You chose ${ctx.name(target)}.`]);

/** Tells a player they changed sides. Their character stays the same, so nothing else on their phone shows it. */
export const tellAlignment = (ctx: AbilityCtx<unknown>, player: PlayerId, alignment: Alignment) =>
  ctx.notify(player, `You are now ${alignment}.`, [
    `Your character has not changed, but you are now on the ${alignment} team.`,
  ]);

/** Makes `to` the Demon in place of `from`: a token moves, a character is copied. Gained abilities stay. */
export function handOverDemon(ctx: AbilityCtx<unknown>, to: PlayerId, from: PlayerId, pending = false) {
  const src = ctx.demonSource(from);
  if (!src) return;
  const options = { pending };
  if (src.kind === 'ability') {
    ctx.move(src.id, to);
    // A token remembers who inherited it, for a jinx that keeps it there (Lil' Monsta & Scarlet Woman).
    const token = ctx.instance(src.id);
    if (token) token.state = { ...(token.state as object), heir: to };
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

/**
 * A curse: a mark until dusk on a player who dies if something happens today (they nominate, or are nominated). The
 * console doesn't record nominations, so the Storyteller presses the curse's switch on the Day tab when it goes off.
 */
const CURSE = 'Cursed';

export interface CurseState {
  /** Curses that went off, kept so the Day tab shows them switched on and a second press takes them back. */
  applied?: Confirmed[];
}

export const curse = (ctx: AbilityCtx<unknown>, target: PlayerId) =>
  ctx.addCondition(target, 'marker', { until: 'dusk', name: CURSE });

const cursesOn = (ctx: AbilityCtx<unknown>) => ctx.conditionsFrom('marker').filter((c) => c.name === CURSE);
const appliedToday = (ctx: AbilityCtx<CurseState>) => (ctx.state.applied ?? []).filter((x) => x.day === ctx.n);

/**
 * The Day tab's switches: one per living cursed player, as a curse does nothing to the dead. One that went off today
 * stays, switched on, so it can be taken back.
 */
export function curseSwitches(
  ctx: AbilityCtx<CurseState>,
  o: { title: string; prompt: string; order: number },
): DayActionDraft[] {
  const on = appliedToday(ctx).map((x) => x.target);
  const waiting = cursesOn(ctx)
    .map((c) => c.target)
    .filter((t) => ctx.isAlive(t));
  const targets = [...new Set([...waiting, ...on])];
  if (!targets.length) return [];
  return [
    {
      action: 'apply_curse',
      title: o.title,
      prompt: o.prompt,
      preview: true,
      order: o.order,
      control: 'toggle',
      recorded: on.length ? on : null,
      fields: [{ kind: 'player', label: 'Cursed', options: targets }],
    },
  ];
}

/**
 * A curse's switch pressed: the curse goes off and kills its target. Pressed again, it is taken back: the target is
 * cursed again, and alive again if it killed them. `what` names it in the log ("Witch curse").
 */
export function applyCurse(
  ctx: AbilityCtx<CurseState>,
  target: PlayerId,
  cause: string,
  force: 'none' | 'success' | 'fail',
  what: string,
): DayActionOutcome {
  const name = ctx.name(target);
  const done = appliedToday(ctx).find((x) => x.target === target);
  if (done) {
    if (done.died && !ctx.isAlive(target)) ctx.revive(target, `the ${what} was taken back`);
    curse(ctx, target);
    ctx.setState({ applied: (ctx.state.applied ?? []).filter((x) => x !== done) });
    return { summary: `Taken back: ${name} is cursed again${done.died ? ' and alive' : ''}.`, effective: true };
  }
  for (const c of cursesOn(ctx)) if (c.target === target) ctx.removeCondition(c);
  const { outcome, confirmed } = confirmKill(ctx, target, () => dayKill(ctx, target, cause, force));
  ctx.setState({ applied: [...(ctx.state.applied ?? []), confirmed] });
  return outcome;
}

/** Autoplay: the curse on this player goes off, if there is one still waiting. */
export function setOffCurse(ctx: AbilityCtx<CurseState>, target: PlayerId, cause: string, what: string) {
  if (!ctx.isAlive(target) || !cursesOn(ctx).some((c) => c.target === target)) return;
  applyCurse(ctx, target, cause, 'none', what);
}

/** Takes a confirmed day action back: whoever died of it lives again. */
export function takeBack(ctx: AbilityCtx<unknown>, c: Confirmed | null, what: string): DayActionOutcome {
  if (!c) return { summary: 'Nothing to take back.', effective: false };
  if (c.died && !ctx.isAlive(c.target)) ctx.revive(c.target, `the ${what} was taken back`);
  return { summary: `Taken back${c.died ? `: ${ctx.name(c.target)} is alive` : ''}.`, effective: true };
}
