import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'golem', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Golem', () => {
  it('kills a non-Demon nominee, once', () => {
    const s = scene(cast).start().dawn();
    s.nominate('ann', 'bo').prompt('yes');
    expect(s.alive('bo')).toBe(false);
    s.nominate('ann', 'di');
    expect(s.state.prompts).toEqual([]);
  });
  it('nothing happens to the Demon', () => {
    const s = scene(cast).start().dawn();
    s.nominate('ann', 'cy');
    expect(s.state.prompts).toEqual([]);
  });
});
