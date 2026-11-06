import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

// Applied by the Juggler's own wake rule: a hidden copy of the ability wakes only if a count was entered.
export const cannibalJuggler = defineJinx({
  a: roleId('cannibal'),
  b: roleId('juggler'),
  text: 'If the Juggler guesses on their first day and dies by execution, tonight the living Cannibal learns how many guesses the Juggler got correct.',
  handling: 'engine',
  source: DJINN,
});
