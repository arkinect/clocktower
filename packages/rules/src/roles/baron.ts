import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const baron = defineRole({
  id: roleId('baron'),
  name: 'Baron',
  type: 'minion',
  abilityText: 'There are extra Outsiders in play. [+2 Outsiders]',
  setupRules: {
    counts(c) {
      c[1] += 2;
      c[0] -= 2;
    },
  },
});
