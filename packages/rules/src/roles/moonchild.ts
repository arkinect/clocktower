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
    wakes: (ctx) => !ctx.aliveAtDusk(ctx.holder) && !!target(ctx) && !ctx.ability.used,
    dayActions(ctx) {
      if (ctx.isAlive(ctx.holder) || ctx.ability.used) return [];
      return [
        {
          action: 'target',
          title: `Moonchild (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they publicly choose?',
          preview: false,
          fields: [{ kind: 'player', label: 'Target', options: ctx.alive }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      ctx.setState({ target: { day: ctx.n, player: values[0] as PlayerId } });
      return { summary: `Moonchild's target: ${ctx.name(values[0])}.`, effective: true };
    },
    resolve(ctx) {
      const t = target(ctx);
      if (!t) return;
      ctx.markUsed();
      ctx.outcome(`target ${ctx.name(t)}`);
      if (ctx.state.soberAtDeath === false) ctx.outcome('impaired at death: no effect');
      else if (!ctx.isAlive(t)) ctx.outcome('target already dead');
      else if (ctx.registers(t).alignment === 'good') ctx.attemptKill(t, 'ability_kill');
      else ctx.outcome('target is not good: nothing happens');
    },
  },
});
