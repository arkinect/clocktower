import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

// Applied by the Demon hand-over itself, which moves a token rather than copying a character.
export const lilMonstaScarletWoman = defineJinx({
  a: roleId('lil_monsta'),
  b: roleId('scarlet_woman'),
  text: "If Lil' Monsta dies with 5 or more players alive, the Scarlet Woman babysits Lil' Monsta for the rest of the game.",
  handling: 'engine',
  source: DJINN,
});
