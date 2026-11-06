import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

interface State {
  last: { night: number; target: PlayerId } | null;
}

export const devilsAdvocate = defineRole<State>({
  id: roleId('devils_advocate'),
  name: "Devil's Advocate",
  type: 'minion',
  abilityText: "Each night, choose a living player (different to last night): if executed tomorrow, they don't die.",
  reminder: 'Execution protection is not enforced.',
  night: { first: 70, other: 70 },
  initialState: () => ({ last: null }),
  ability: {
    picker(ctx) {
      const last = ctx.state.last;
      const exclude = last && last.night === ctx.n - 1 ? last.target : null;
      return choosePlayers(
        "Devil's Advocate",
        "Choose a player (different to last night): if executed tomorrow, they don't die.",
        1,
        ctx.alive.filter((x) => x !== exclude),
      );
    },
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      ctx.setState({ last: { night: ctx.n, target: t } });
      if (ctx.impaired) {
        ctx.outcome('impaired: no effect');
        return;
      }
      ctx.addCondition(t, 'marker', { until: 'dusk', name: 'Survives execution' });
      ctx.outcome(`${ctx.name(t)} survives execution tomorrow`);
    },
    dayNotice(ctx) {
      const c = ctx.conditionsFrom('marker')[0];
      return c ? `${ctx.name(c.target)} does not die if executed today.` : null;
    },
  },
});
