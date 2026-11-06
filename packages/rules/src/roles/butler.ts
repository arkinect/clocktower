import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const butler = defineRole({
  id: roleId('butler'),
  name: 'Butler',
  type: 'outsider',
  abilityText: 'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.',
  reminder: 'Voting restriction is not enforced.',
  night: { first: 180, other: 360 },
  ability: {
    picker: (ctx) =>
      choosePlayers(
        'Butler',
        'Choose a player (not yourself): tomorrow you may only vote if they are voting too.',
        1,
        ctx.seated.filter((x) => x !== ctx.holder),
      ),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      if (!ctx.impaired) ctx.addCondition(t, 'marker', { until: 'dusk', name: 'Butler master' });
      ctx.outcome(`master: ${ctx.name(t)}${ctx.impaired ? ' (no effect, impaired)' : ''}`);
      ctx.inform({ truth: [`Your master is ${ctx.name(t)}.`] });
    },
    dayNotice(ctx) {
      const master = ctx.conditionsFrom('marker')[0];
      return master ? `${ctx.name(ctx.holder)} (Butler) may only vote if ${ctx.name(master.target)} votes.` : null;
    },
  },
});
