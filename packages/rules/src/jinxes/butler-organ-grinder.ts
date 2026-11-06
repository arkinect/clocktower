import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

export const butlerOrganGrinder = defineJinx({
  a: roleId('butler'),
  b: roleId('organ_grinder'),
  text: 'If the Organ Grinder is causing eyes closed voting, the Butler may raise their hand to vote but their vote is only counted if their master voted too.',
  handling: 'reminder',
  source: DJINN,
});
