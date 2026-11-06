import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { believes, DJINN } from './lib';

const MARIONETTE = roleId('marionette');
const HUNTSMAN = roleId('huntsman');

export const marionetteHuntsman = defineJinx({
  a: MARIONETTE,
  b: HUNTSMAN,
  text: 'If the Marionette thinks that they are the Huntsman, the Damsel was added during setup.',
  handling: 'engine',
  source: DJINN,
  hooks: {
    checklist: (r) =>
      believes(r, MARIONETTE, HUNTSMAN)
        ? [
            {
              id: 'jinx:marionette:huntsman',
              label:
                'Jinx (Marionette & Huntsman): the Marionette thinks they are the Huntsman, so the Damsel must be in play',
              done: r.inPlay.includes(roleId('damsel')),
              blocking: true,
            },
          ]
        : [],
  },
});
