import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const poisoner = defineRole({
  id: roleId('poisoner'),
  name: 'Poisoner',
  type: 'minion',
  abilityText: 'Each night, choose a player: they are poisoned tonight and tomorrow day.',
  night: { first: 40, other: 30 },
  ability: {
    picker: (ctx) =>
      choosePlayers('Poisoner', 'Choose a player: they are poisoned tonight and tomorrow day.', 1, ctx.seated),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      if (ctx.impaired) {
        ctx.outcome('impaired: no effect');
        return;
      }
      ctx.addCondition(t, 'poisoned', { until: 'dusk' });
      ctx.outcome(`${ctx.name(t)} is poisoned`);
    },
  },
});
