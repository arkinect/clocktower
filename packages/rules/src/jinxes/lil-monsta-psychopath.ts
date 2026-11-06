import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

export const lilMonstaPsychopath = defineJinx({
  a: roleId('lil_monsta'),
  b: roleId('psychopath'),
  text: "If the Psychopath is babysitting Lil' Monsta, they die when executed.",
  handling: 'reminder',
  source: DJINN,
});
