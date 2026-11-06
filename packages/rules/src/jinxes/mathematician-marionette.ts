import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { countBelieved, DJINN } from './lib';

const MARIONETTE = roleId('marionette');

export const mathematicianMarionette = defineJinx({
  a: roleId('mathematician'),
  b: MARIONETTE,
  text: "The Mathematician learns if the Marionette's ability yielded false info or failed to work properly.",
  handling: 'engine',
  source: DJINN,
  hooks: { beforeMalfunctionCount: (ctx) => countBelieved(ctx, MARIONETTE, 'Marionette') },
});
