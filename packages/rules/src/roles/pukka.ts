import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const pukka = defineRole({
  id: roleId('pukka'),
  name: 'Pukka',
  type: 'demon',
  abilityText:
    'Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy.',
  night: { first: 100, other: 120 },
  ability: {
    picker: (ctx) =>
      choosePlayers('Pukka', 'Choose a player: they are poisoned. The previously poisoned player dies.', 1, ctx.seated),
    resolve(ctx) {
      const prev = ctx.conditionsFrom('poisoned')[0];
      if (prev) {
        ctx.removeCondition(prev);
        if (ctx.isAlive(prev.target)) ctx.attemptKill(prev.target, 'demon_attack');
      }
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      if (ctx.impaired) {
        ctx.outcome('impaired: no new poison');
        return;
      }
      ctx.addCondition(t, 'poisoned', { until: 'source_acts_again' });
      ctx.outcome(`${ctx.name(t)} is poisoned`);
    },
  },
});
