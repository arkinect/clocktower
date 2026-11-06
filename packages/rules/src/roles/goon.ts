import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const goon = defineRole({
  id: roleId('goon'),
  name: 'Goon',
  type: 'outsider',
  abilityText:
    'Each night, the 1st player to choose you with their ability is drunk until dusk. You become their alignment.',
  flags: { passive: true },
  ability: {
    onChosen(ctx, chooser) {
      if (ctx.ability.origin.kind !== 'character' || ctx.believed) return;
      const me = ctx.holder;
      if (!ctx.run.markChosen(`goon:${me}`)) return;
      if (ctx.impaired) {
        ctx.malfunctionIfExternal('Goon had no effect');
        ctx.outcome(`${ctx.name(chooser.player)} chose the Goon (${ctx.name(me)}), but the Goon is impaired`);
        return;
      }
      ctx.addCondition(chooser.player, 'drunk', { until: 'dusk' });
      const alignment = ctx.alignmentOf(chooser.player);
      ctx.changeAlignment(me, alignment, 'the Goon was chosen');
      ctx.outcome(`${ctx.name(chooser.player)} chose the Goon first: drunk until dusk, Goon becomes ${alignment}`);
    },
  },
});
