import { roleId, type AbilityId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';

interface State {
  ate: boolean;
  /** The executee was evil: anything set here gives false information. */
  fake: boolean;
  eaten: AbilityId | null;
  roleId: RoleId | null;
  /** The Storyteller's choice, made by day, of what an evil executee will look like to the Cannibal. */
  plan?: { day: number; executee: PlayerId; role: RoleId } | null;
}

const CANNIBAL = roleId('cannibal');
const JINX = 'Jinx (Cannibal & ';

/** The one way what a Cannibal ate changes. The old ability goes, with whatever it gained. */
function setEaten(ctx: AbilityCtx<State>, role: RoleId | null, fake: boolean) {
  const me = ctx.holder;
  ctx.dropPending(me, JINX);
  // The same ability again is the one they have, freshly: what it gained stays, and a spent use comes back.
  if (ctx.state.eaten && role === ctx.state.roleId) {
    ctx.refresh(ctx.state.eaten);
    ctx.setState({ ate: true, fake, eaten: ctx.state.eaten, roleId: role });
    return;
  }
  if (ctx.state.eaten) ctx.revoke(ctx.state.eaten);
  const reveal = role !== null && ctx.jinx('onGain', role);
  const gained = role
    ? ctx.grant(me, role, {
        shownAs: reveal ? role : (ctx.ability.shownAs ?? ctx.ability.roleId),
        startInfo: true,
        perceivedOnly: fake || ctx.believed,
      })
    : null;
  ctx.setState({ ate: true, fake, eaten: gained?.id ?? null, roleId: role });
  if (reveal && role) {
    const def = ctx.role(role);
    ctx.notify(me, `${JINX}${def.name}): You have the ${def.name} ability`, [def.abilityText], { pending: true });
  }
}

/** What an evil executee can look like: a good character on the script, other than the Cannibal. */
const fakes = (ctx: AbilityCtx<State>) =>
  [...ctx.charactersOfType('townsfolk'), ...ctx.charactersOfType('outsider')].filter((r) => r !== CANNIBAL);

/** The Storyteller's choice for this executee today, if they made one. */
function planned(ctx: AbilityCtx<State>, executee: PlayerId): RoleId | null {
  const plan = ctx.state.plan;
  const ok = plan && plan.day === ctx.n && plan.executee === executee && fakes(ctx).includes(plan.role);
  return ok ? plan.role : null;
}

/** A random good character, preselected on the Day tab. It comes out the same every time, so dusk uses what was shown. */
function suggestion(ctx: AbilityCtx<State>, executee: PlayerId): RoleId | null {
  const options = fakes(ctx);
  return options.length ? ctx.stableRng(`fake:${ctx.n}:${executee}`).pick(options) : null;
}

/** Today's execution, when it would feed this Cannibal an evil player. */
function evilMeal(ctx: AbilityCtx<State>): PlayerId | null {
  if (ctx.ability.activeUntil === 'removed' || ctx.ability.holder.kind !== 'player') return null;
  const me = ctx.holder;
  const executee = ctx.executeeToday;
  if (!executee || executee === me || !ctx.isAlive(me)) return null;
  return ctx.alignmentOf(executee) === 'evil' ? executee : null;
}

export const cannibal = defineRole<State>({
  id: CANNIBAL,
  name: 'Cannibal',
  type: 'townsfolk',
  abilityText:
    'You have the ability of the recently killed executee. If they are evil, you are poisoned until a good player dies by execution.',
  reminder:
    'Gains the ability when an execution kills someone, as the night starts. An evil executee gives a good character on the script instead, as false information, and poisons the Cannibal. Choose that character on the Day tab while the evil player is set to be executed; a random one is preselected.',
  initialState: () => ({ ate: false, fake: false, eaten: null, roleId: null, plan: null }),
  ability: {
    onDayEvent(ctx, e) {
      if (e.kind !== 'execution' || !e.died || !e.playerId) return;
      if (ctx.ability.activeUntil === 'removed' || ctx.ability.holder.kind !== 'player') return;
      const me = ctx.holder;
      const executee = e.playerId;
      if (me === executee || !ctx.isAlive(me)) return;
      const good = ctx.alignmentOf(executee) === 'good';
      // An evil executee: the poisoned Cannibal believes they ate a good player, so they get a good character from the
      // script to play as, which gives false information.
      setEaten(ctx, good ? ctx.character(executee) : (planned(ctx, executee) ?? suggestion(ctx, executee)), !good);
      ctx.setState({ plan: null });
      // "Poisoned until a good player dies by execution": any earlier eat's poison ends here.
      for (const c of ctx.conditionsFrom('poisoned')) ctx.removeCondition(c);
      if (!good && !ctx.believed) ctx.addCondition(me, 'poisoned', { until: 'removed' });
    },
    dayActions(ctx) {
      const executee = evilMeal(ctx);
      if (!executee) return [];
      const options = fakes(ctx);
      // The suggestion counts as the answer until the Storyteller picks another.
      const role = planned(ctx, executee) ?? suggestion(ctx, executee);
      return [
        {
          action: 'fake_eat',
          title: `Cannibal (${ctx.name(ctx.holder)})`,
          prompt: 'Which good character will the Cannibal think they ate?',
          preview: false,
          // After the execution, which it depends on.
          order: 130,
          recorded: role ? [role] : null,
          // Dusk reads it, so Start Night waits for it.
          blocksNight: options.length > 0,
          fields: [{ kind: 'role', label: 'Character', options }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      const executee = evilMeal(ctx);
      const role = values[0] as RoleId;
      if (!executee)
        return { summary: 'Today’s execution would not feed the Cannibal an evil player.', effective: false };
      ctx.setState({ plan: { day: ctx.n, executee, role } });
      return {
        summary: `If ${ctx.name(executee)} dies at dusk, the Cannibal thinks they ate: ${ctx.roleName(role)}.`,
        effective: true,
      };
    },
    summary: (ctx) =>
      ctx.state.ate ? [`Ate: ${ctx.roleName(ctx.state.roleId)}${ctx.state.fake ? ' (false information)' : ''}`] : [],
  },
});

export type { PlayerId };
