import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'pukka', bo: 't1', cy: 't2', di: 't3', ed: 'm1' };
describe('Pukka', () => {
  it('poisons, then kills the night after and the player is healthy', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.impaired('bo')).toBe(true);
    expect(s.alive('bo')).toBe(true);
    s.dusk()
      .submit({ ann: ['cy'] })
      .dawn();
    expect(s.alive('bo')).toBe(false);
    expect(s.impaired('cy')).toBe(true);
    expect(s.impaired('bo')).toBe(false);
  });
});
