import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

export const cannibalButler = defineJinx({
  a: roleId('cannibal'),
  b: roleId('butler'),
  text: 'If the Cannibal gains the Butler ability, the Cannibal learns this.',
  handling: 'engine',
  source: DJINN,
  hooks: { onGain: () => true },
});
