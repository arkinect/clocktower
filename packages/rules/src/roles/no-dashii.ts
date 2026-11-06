import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const noDashii = defineRole({
  id: roleId('no_dashii'),
  name: 'No Dashii',
  type: 'demon',
  abilityText: 'Each night*, choose a player: they die. Your 2 Townsfolk neighbours are poisoned.',
  night: { other: 150 },
  ability: {
    picker: (ctx) => choosePlayers('No Dashii', 'Choose a player: they die.', 1, ctx.seated),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      if (ctx.impaired) ctx.outcome('impaired: no kill');
      else ctx.attemptKill(t, 'demon_attack');
    },
    deriveConditions(ctx) {
      if (ctx.isBelieved(ctx.ability)) return [];
      return ctx
        .nearest(ctx.holder, (p) => ctx.typeOf(p) === 'townsfolk')
        .map((target) => ({ target, type: 'poisoned' }));
    },
  },
});
