import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const organGrinder = defineRole({
  id: roleId('organ_grinder'),
  name: 'Organ Grinder',
  type: 'minion',
  abilityText:
    'All players keep their eyes closed when voting and the vote tally is secret. Each night, choose if you are drunk until dusk.',
  reminder: 'Eyes-closed voting and a secret tally while they are alive and sober; the tally is not tracked here.',
  night: { first: 60, other: 60, note: 'Chooses whether to be drunk until dusk' },
  flags: { dayReminder: true },
  ability: {
    picker: () => ({
      title: 'Organ Grinder',
      prompt: 'Choose whether you are drunk until dusk.',
      fields: [
        {
          kind: 'option',
          label: 'Tonight',
          options: ['drunk', 'sober'],
          labels: { drunk: 'Drunk until dusk', sober: 'Stay sober' },
        },
      ],
    }),
    resolve(ctx) {
      const [c] = ctx.choice;
      if (c !== 'drunk') ctx.outcome(c === 'sober' ? 'stays sober' : 'no choice: stays sober');
      else if (ctx.impaired) ctx.outcome('chose drunk, but is already impaired: no effect');
      else {
        ctx.addCondition(ctx.holder, 'drunk', { until: 'dusk' });
        ctx.outcome('drunk until dusk (own choice)');
      }
    },
    dayNotice(ctx) {
      if (ctx.believed || !ctx.isAlive(ctx.holder) || ctx.impaired) return null;
      return 'Eyes-closed voting today: the Organ Grinder is alive and sober.';
    },
  },
});
