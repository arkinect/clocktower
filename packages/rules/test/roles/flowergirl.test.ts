import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'flowergirl', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' };
describe('Flowergirl', () => {
  it('learns whether a Demon voted, as recorded today', () => {
    const s = scene(cast).start().dawn();
    s.act('flowergirl', 'demon_voted', ['yes']);
    s.dusk();
    expect(s.truth('ann')).toEqual(['Yes, a Demon voted today.']);
  });
  it('defaults to no', () => {
    const s = scene(cast).start().nextNight();
    expect(s.truth('ann')).toEqual(['No, a Demon did not vote today.']);
  });
  it('does not act on Night 0', () => {
    expect(scene(cast).start().truth('ann')).toEqual([]);
  });
});
