import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

interface State {
  extraDay: number | null;
}

export const mastermind = defineRole<State>({
  id: roleId('mastermind'),
  name: 'Mastermind',
  type: 'minion',
  abilityText:
    'If the Demon dies by execution (ending the game), play for 1 more day. If a player is then executed, their team loses.',
  reminder: 'A game-end suggestion follows the execution on the extra day.',
  flags: { dayReminder: true },
  initialState: () => ({ extraDay: null }),
  ability: {
    onDayEvent(ctx, e) {
      if (e.kind !== 'execution' || ctx.believed || ctx.ability.holder.kind !== 'player') return;
      if (e.died && e.playerId && e.demonDiedAliveBefore !== null) {
        if (ctx.isAlive(ctx.holder) && !ctx.impaired && !ctx.demons.some(ctx.isAlive))
          ctx.setState({ extraDay: ctx.n + 1 });
        return;
      }
      if (ctx.state.extraDay === ctx.n && e.playerId) {
        const loser = ctx.alignmentOf(e.playerId as PlayerId);
        ctx.suggestGameEnd(
          'mastermind',
          loser === 'good' ? 'evil' : 'good',
          `${ctx.name(e.playerId)} was executed on the extra day.`,
        );
      }
    },
    checkGameEnd(ctx) {
      if (ctx.state.extraDay !== null && ctx.moment.n <= ctx.state.extraDay) ctx.suppressGameEnd('no_demon');
    },
  },
});
