import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const zealot = defineRole({
  id: roleId('zealot'),
  name: 'Zealot',
  type: 'outsider',
  abilityText: 'If there are 5 or more players alive, you must vote for every nomination.',
  reminder: 'Must vote for every nomination while 5 or more players are alive (not enforced).',
  flags: { dayReminder: true },
});
