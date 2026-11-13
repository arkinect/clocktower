import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';

interface State {
  target: { day: number; player: PlayerId } | null;
  soberAtDeath: boolean | null;
}

/** Today's public choice, which belongs to every holder of the ability. */
const target = (ctx: AbilityCtx<State>) =>
  ctx.peers.find((a) => a.state.target?.day === ctx.n)?.state.target?.player ?? null;

/**
 * The day they learn they died. A night death shows at dawn. So does an execution: it happens at dusk, and whether it
 * killed them (a Tea Lady may save them) is known in the morning. Any other day death is seen as it happens.
 */
function learnedOn(ctx: AbilityCtx<State>): number | null {
  const life = ctx.player(ctx.holder).life;
  const at = life.diedAt;
  if (!at) return null;
  return at.kind === 'night' || life.cause === 'execution' ? at.n + 1 : at.n;
}

/** Not recorded during the day: the Storyteller must answer it before dawn (or force, which means no choice). */
function askedTarget(ctx: AbilityCtx<State>): PlayerId | null {
  const chosen = ctx.decide<string>({
    key: { kind: 'moonchild_target' },
    title: `Moonchild (${ctx.name(ctx.holder)}): who did they choose?`,
    description: 'Not recorded during the day.',
    options: [
      ...ctx.aliveAtDuskIds.map((id) => ({ id, label: ctx.name(id) })),
      { id: 'none', label: "They didn't choose" },
    ],
    default: 'none',
    required: true,
  });
  return chosen === 'none' ? null : (chosen as PlayerId);
}

export const moonchild = defineRole<State>({
  id: roleId('moonchild'),
  name: 'Moonchild',
  type: 'outsider',
  abilityText:
    'When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die.',
  reminder:
    'Record the chosen player in the Day panel on the day they learn they died: the morning after a night death or an execution.',
  night: { other: 250, note: 'Only if a target was chosen' },
  flags: { worksWhileDead: true },
  initialState: () => ({ target: null, soberAtDeath: null }),
  ability: {
    onDeath(ctx, death) {
      if (death.playerId === ctx.holder) ctx.setState({ soberAtDeath: !death.impairedAtDeath });
    },
    onRevive(ctx, id) {
      if (id === ctx.holder) ctx.setState({ soberAtDeath: null });
    },
    // Also when nothing was recorded on the day they learned of their death: Review then asks who they chose.
    wakes: (ctx) => !ctx.aliveAtDusk(ctx.holder) && !ctx.ability.used && (!!target(ctx) || learnedOn(ctx) === ctx.n),
    dayActions(ctx) {
      if (ctx.isAlive(ctx.holder) || ctx.ability.used) return [];
      return [
        {
          action: 'target',
          title: `Moonchild (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they publicly choose? If good, they die tonight.',
          preview: false,
          // First thing in the day: they choose when they learn they died. No default: they must choose, so Review asks
          // if this is left blank.
          order: 5,
          clearable: true,
          emptyLabel: 'Not chosen yet',
          recorded: target(ctx) ? [target(ctx) as string] : null,
          neededTonight: true,
          fields: [{ kind: 'player', label: 'Target', options: ctx.alive }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      if (!values.length) {
        ctx.setState({ target: null });
        return { summary: "Moonchild's choice cleared.", effective: true };
      }
      ctx.setState({ target: { day: ctx.n, player: values[0] as PlayerId } });
      return { summary: `Moonchild's target: ${ctx.name(values[0])}.`, effective: true };
    },
    resolve(ctx) {
      const t = target(ctx) ?? askedTarget(ctx);
      ctx.markUsed();
      if (!t) {
        ctx.outcome('no player chosen');
        return;
      }
      ctx.outcome(`target ${ctx.name(t)}`);
      if (ctx.state.soberAtDeath === false) ctx.outcome('impaired at death: no effect');
      else if (!ctx.isAlive(t)) ctx.outcome('target already dead');
      else if (ctx.registers(t).alignment === 'good') ctx.attemptKill(t, 'ability_kill');
      else ctx.outcome('target is not good: nothing happens');
    },
  },
});
