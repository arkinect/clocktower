import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { believes, DJINN } from './lib';

const MARIONETTE = roleId('marionette');
const BALLOONIST = roleId('balloonist');

export const marionetteBalloonist = defineJinx({
  a: MARIONETTE,
  b: BALLOONIST,
  text: 'If the Marionette thinks that they are the Balloonist, an Outsider might have been added during setup.',
  handling: 'engine',
  source: DJINN,
  hooks: {
    warnings: (r) =>
      believes(r, MARIONETTE, BALLOONIST)
        ? [
            'Jinx (Marionette & Balloonist): the Marionette thinks they are the Balloonist, so an Outsider may be added.',
          ]
        : [],
  },
});
