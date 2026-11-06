import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { countBelieved, DJINN } from './lib';

const DRUNK = roleId('drunk');

export const mathematicianDrunk = defineJinx({
  a: roleId('mathematician'),
  b: DRUNK,
  text: 'The Mathematician learns if the Drunk’s ability yielded false info or failed to work properly.',
  handling: 'engine',
  source: DJINN,
  hooks: { beforeMalfunctionCount: (ctx) => countBelieved(ctx, DRUNK, 'Drunk') },
});
