import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

export const marionetteLilMonsta = defineJinx({
  a: roleId('marionette'),
  b: roleId('lil_monsta'),
  text: 'If there would be a Marionette in play, they enter play after the Demon & must start as their neighbor.',
  handling: 'reminder',
  source: DJINN,
});
