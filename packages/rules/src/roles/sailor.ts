import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const sailor = defineRole({
  id: roleId('sailor'),
  name: 'Sailor',
  type: 'townsfolk',
  abilityText: "Each night, choose an alive player: either you or they are drunk until dusk. You can't die.",
  night: { first: 30, other: 20 },
  flags: { interceptPriority: 10, passive: true },
  ability: {
    picker: (ctx) => choosePlayers('Sailor', 'Choose a player: either you or they are drunk until dusk.', 1, ctx.alive),
    resolve(ctx) {
      const [t] = ctx.choice;
      if (!t) return;
      const me = ctx.holder;
      if (ctx.impaired) {
        ctx.outcome('impaired: no effect');
        return;
      }
      let drunk = me;
      if (t !== me) {
        const coin = ctx.rng('coin').coin();
        drunk = ctx.decide({
          key: { kind: 'sailor' },
          title: `Sailor ${ctx.name(me)}: who is drunk?`,
          description: `Sailor chose ${ctx.name(t)}. Coin recommends ${coin ? 'the Sailor' : 'the chosen player'}.`,
          options: [
            { id: me, label: `${ctx.name(me)} (Sailor)` },
            { id: t as typeof me, label: ctx.name(t) },
          ],
          default: coin ? me : (t as typeof me),
        });
      }
      ctx.addCondition(drunk, 'drunk', { until: 'dusk' });
      ctx.outcome(`${ctx.name(drunk)} is drunk until dusk`);
    },
    interceptKill(ctx, kill) {
      if (kill.unstoppable || ctx.ability.holder.kind !== 'player' || kill.target !== ctx.holder) return 'pass';
      if (!ctx.impaired) {
        ctx.outcome(`${ctx.name(kill.target)} survives: Sailor can't die`);
        return 'prevent';
      }
      ctx.malfunctionIfExternal('Sailor protection failed');
      return 'pass';
    },
  },
});
