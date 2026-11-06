import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'assassin', bo: 'fool', cy: 'd1', di: 't2', ed: 't3' };
describe('Assassin', () => {
  it('kills through any protection, once', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.alive('bo')).toBe(false);
    s.dusk();
    expect(s.specs('ann')).toEqual([]);
  });
  it('a poisoned Assassin spends the shot for nothing', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .nextNight();
    s.submit({ ann: ['bo'], di: ['ann'] }).dawn();
    expect(s.alive('bo')).toBe(true);
    s.dusk();
    expect(s.specs('ann')).toEqual([]);
  });
});
