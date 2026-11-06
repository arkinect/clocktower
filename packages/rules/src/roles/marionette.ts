import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { drunkFromTheStart, soberOnChange } from './lib';

export const marionette = defineRole({
  id: roleId('marionette'),
  name: 'Marionette',
  type: 'minion',
  abilityText:
    'You think you are a good character but you are not. The Demon knows who you are. [You neighbour the Demon]',
  believes: { allowed: (r) => r.alignment === 'good', label: "the Marionette's believed good role" },
  setupRules: { neighbours: 'demon' },
  ability: {
    setup: drunkFromTheStart,
    onCharacterChange: soberOnChange,
    modifyEvilInfo(ctx, info) {
      const me = ctx.holder;
      info.minions = info.minions.filter((x) => x !== me);
      info.demonLines.push(`The Marionette is: ${ctx.name(me)}`);
    },
  },
});
