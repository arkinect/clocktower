import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'slayer', bo: 't1', cy: 'imp', di: 'fortune_teller', ed: 't3' };
const day = () =>
  scene(cast, { fields: { fortune_teller: { herring: 'ed' } } })
    .start()
    .dawn();
describe('Slayer', () => {
  it('kills the Demon', () => {
    const s = day();
    expect(s.act('slayer', 'shoot', ['cy']).effective).toBe(true);
    expect(s.alive('cy')).toBe(false);
  });
  it('misses anyone else, the red herring too, and spends the shot', () => {
    for (const target of ['bo', 'ed']) {
      const s = day();
      expect(s.act('slayer', 'shoot', [target]).effective).toBe(false);
      s.dusk().dawn();
      expect(s.dayActions()).toEqual([]);
    }
  });
});
