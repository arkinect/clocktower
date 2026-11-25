import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'inquisitor', bo: 't1', cy: 'imp', di: 'm1', ed: 't3' };
describe('Inquisitor', () => {
  it('kills a good nominee; nothing happens to an evil one, and the use is spent', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('inquisitor', 'nominated', ['bo']).effective).toBe(true);
    expect(s.alive('bo')).toBe(false);
    for (const nominee of ['cy', 'di']) {
      const t = scene(cast).start().dawn();
      expect(t.act('inquisitor', 'nominated', [nominee]).effective).toBe(false);
      expect(t.alive(nominee)).toBe(true);
      expect(t.state.abilities.get(t.ability('inquisitor'))?.used).toBe(true);
    }
  });
});
