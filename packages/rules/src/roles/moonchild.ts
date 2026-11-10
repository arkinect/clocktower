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

/** The day they learned they died: they died last night or today. */
function learnedOfDeathToday(ctx: AbilityCtx<State>) {
  const at = ctx.player(ctx.holder).life.diedAt;
  return !!at && ((at.kind === 'night' && at.n === ctx.n - 1) || (at.kind === 'day' && at.n === ctx.n));
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
  reminder: 'Record the chosen player in the Day panel after the Moonchild dies.',
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
    wakes: (ctx) => !ctx.aliveAtDusk(ctx.holder) && !ctx.ability.used && (!!target(ctx) || learnedOfDeathToday(ctx)),
    dayActions(ctx) {
      if (ctx.isAlive(ctx.holder) || ctx.ability.used) return [];
      return [
        {
          action: 'target',
          title: `Moonchild (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they publicly choose?',
          preview: false,
          recorded: target(ctx) ? [target(ctx) as string] : null,
          neededTonight: true,
          fields: [{ kind: 'player', label: 'Target', options: ctx.alive }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
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
