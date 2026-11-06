import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { drunkFromTheStart, soberOnChange } from './lib';

export const drunk = defineRole({
  id: roleId('drunk'),
  name: 'Drunk',
  type: 'outsider',
  abilityText: 'You do not know you are the Drunk. You think you are a Townsfolk character, but you are not.',
  believes: { allowed: (r) => r.type === 'townsfolk', label: "the Drunk's believed Townsfolk" },
  ability: {
    setup: drunkFromTheStart,
    onCharacterChange: soberOnChange,
  },
});
