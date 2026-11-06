import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'po', bo: 't1', cy: 't2', di: 't3', ed: 't4', fi: 'm1' };
describe('Po', () => {
  it('kills one, or charges up for three', () => {
    const s = scene(cast).start().nextNight();
    expect(s.specs('ann')[0]?.fields).toHaveLength(1);
    s.submit({ ann: [] }).nextNight();
    expect(s.specs('ann')[0]?.fields).toHaveLength(3);
    s.submit({ ann: ['bo', 'cy', 'di'] }).dawn();
    expect(s.dead('bo', 'cy', 'di')).toBe(true);
  });
});
