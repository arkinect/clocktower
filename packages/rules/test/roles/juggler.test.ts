import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'juggler', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
describe('Juggler', () => {
  it('learns the count entered on day 1', () => {
    const s = scene(cast).start().dawn();
    s.act('juggler', 'count', ['3']);
    s.dusk();
    expect(s.truth('ann')).toEqual(['You guessed 3 correctly.']);
  });
  it('only that night', () => {
    const s = scene(cast).start().dawn();
    s.act('juggler', 'count', ['3']);
    s.nextNight().nextNight();
    expect(s.truth('ann')).toEqual([]);
  });
});
