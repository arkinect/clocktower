import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const artist = defineRole({
  id: roleId('artist'),
  name: 'Artist',
  type: 'townsfolk',
  abilityText: 'Once per game, during the day, privately ask the Storyteller any yes/no question.',
  reminder: 'Day ability. Mark used in the Ability tracker.',
  flags: { oncePerGame: 'manual' },
});
