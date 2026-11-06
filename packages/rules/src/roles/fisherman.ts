import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const fisherman = defineRole({
  id: roleId('fisherman'),
  name: 'Fisherman',
  type: 'townsfolk',
  abilityText: 'Once per game, during the day, visit the Storyteller for some advice to help your team win.',
  reminder: 'Day ability: give advice in person. Mark used in the Ability tracker.',
  flags: { oncePerGame: 'manual', dayReminder: true },
});
