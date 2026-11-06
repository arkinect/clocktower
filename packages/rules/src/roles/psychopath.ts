import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const psychopath = defineRole({
  id: roleId('psychopath'),
  name: 'Psychopath',
  type: 'minion',
  abilityText:
    'Each day, before nominations, you may publicly choose a player: they die. If executed, you only die if you lose roshambo.',
  reminder: 'Day ability. Mark deaths yourself.',
  flags: { dayReminder: true },
});
