import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'poisoner', bo: 'empath', cy: 'd1', di: 't2', ed: 't3' };
describe('Poisoner', () => {
  it('poisons tonight and tomorrow, then it wears off at dusk', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] });
    expect(s.row('bo').impaired).toBe(true);
    s.dawn();
    expect(s.impaired('bo')).toBe(true);
    s.dusk();
    expect(s.impaired('bo')).toBe(false);
  });
  it('a dead Poisoner does nothing', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    s.execute('ann').dusk();
    expect(s.specs('ann')).toEqual([]);
    expect(s.row('bo').impaired).toBe(false);
  });
});
