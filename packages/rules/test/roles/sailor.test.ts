import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'sailor', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Sailor', () => {
  it("can't die at night", () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo'], cy: ['ann'] });
    s.decide('sailor', 'bo').dawn();
    expect(s.alive('ann')).toBe(true);
  });
  it('dies when they are the drunk one', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo'], cy: ['ann'] });
    s.decide('sailor', 'ann').dawn();
    expect(s.alive('ann')).toBe(false);
  });
  it('choosing themselves makes them drunk with no decision', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['ann'] });
    expect(s.hasDecision('sailor')).toBe(false);
    s.dawn();
    expect(s.impaired('ann')).toBe(true);
  });
});
