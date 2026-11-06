import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'innkeeper', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Innkeeper', () => {
  it('protects two, one of them drunk until dusk', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'di'], cy: ['bo'] });
    s.decide('innkeeper', 'di').dawn();
    expect(s.alive('bo')).toBe(true);
    expect(s.impaired('di')).toBe(true);
    s.dusk();
    expect(s.impaired('di')).toBe(false);
  });
  it('protection does not reach into the day', () => {
    const s = scene({ ...cast, di: 'slayer' })
      .start()
      .nextNight()
      .submit({ ann: ['cy', 'bo'] });
    s.decide('innkeeper', 'bo').dawn();
    expect(s.act('slayer', 'shoot', ['cy']).effective).toBe(true);
    expect(s.alive('cy')).toBe(false);
  });
});
