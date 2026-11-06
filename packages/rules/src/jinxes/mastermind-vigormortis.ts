import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

export const mastermindVigormortis = defineJinx({
  a: roleId('mastermind'),
  b: roleId('vigormortis'),
  text: 'A Mastermind that has their ability keeps it if the Vigormortis dies.',
  handling: 'reminder',
  source: DJINN,
});
