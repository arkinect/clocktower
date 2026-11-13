import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';

/** The answer "they chose no one": a real answer, which spends the ability. */
const NO_ONE = 'none';

interface State {
  /** Today's answer. `player` null: they chose no one. */
  target: { day: number; player: PlayerId | null } | null;
  soberAtDeath: boolean | null;
}

/** Today's answer, which belongs to every holder of the ability: undefined while there is none. */
const answer = (ctx: AbilityCtx<State>) => ctx.peers.find((a) => a.state.target?.day === ctx.n)?.state.target;

/** Today's chosen player, if they chose one. */
const target = (ctx: AbilityCtx<State>) => answer(ctx)?.player ?? null;

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

export const moonchild = defineRole<State>({
  id: roleId('moonchild'),
  name: 'Moonchild',
  type: 'outsider',
  abilityText:
    'When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die.',
  reminder:
    'Record the chosen player on the Day tab on the day they learn they died: the morning after a night death or an execution. No one unless changed.',
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
    // Only the night after a player was chosen. Dusk records "no one" if nothing else was, so Review never asks.
    wakes: (ctx) => !ctx.aliveAtDusk(ctx.holder) && !ctx.ability.used && !!target(ctx),
    dayActions(ctx) {
      const today = answer(ctx);
      // Only on the day they learn they died: they choose then or not at all. "No one" spends it at once, but it stays
      // shown that day so it can be changed.
      if (ctx.isAlive(ctx.holder) || learnedOn(ctx) !== ctx.n || (ctx.ability.used && !today)) return [];
      return [
        {
          action: 'target',
          title: `Moonchild (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they publicly choose?',
          preview: false,
          // First thing in the day: they choose when they learn they died. "No one" unless changed: dusk records it.
          order: 5,
          default: [NO_ONE],
          recorded: today ? [today.player ?? NO_ONE] : null,
          fields: [
            {
              kind: 'option',
              label: 'Target',
              options: [NO_ONE, ...ctx.alive],
              labels: Object.fromEntries([[NO_ONE, 'No one'], ...ctx.alive.map((id) => [id, ctx.name(id)])]),
            },
          ],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      const player = values[0] === NO_ONE ? null : (values[0] as PlayerId);
      ctx.setState({ target: { day: ctx.n, player } });
      // No one: the ability is spent now, as nothing wakes tonight. A player: spent when it resolves tonight.
      ctx.markUsed(player === null);
      return {
        summary: player ? `Moonchild's target: ${ctx.name(player)}.` : 'The Moonchild chose no one.',
        effective: true,
      };
    },
    resolve(ctx) {
      const t = target(ctx);
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
