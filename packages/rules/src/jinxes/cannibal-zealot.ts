import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

export const cannibalZealot = defineJinx({
  a: roleId('cannibal'),
  b: roleId('zealot'),
  text: 'If the Cannibal gains the Zealot ability, the Cannibal learns this.',
  handling: 'engine',
  source: DJINN,
  hooks: { onGain: () => true },
});
