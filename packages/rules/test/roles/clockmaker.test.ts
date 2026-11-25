import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Clockmaker', () => {
  it('counts the steps from the Demon to the nearest Minion, on Night 0 only', () => {
    const s = scene({ ann: 'clockmaker', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' }).start();
    expect(s.truth('ann')).toEqual(['The Demon is 2 steps from its nearest Minion.']);
    s.nextNight();
    expect(s.truth('ann')).toEqual([]);
  });
  it('gained after a starpass, it counts from the living Imp', () => {
    // The dead Imp sits next to the other Minion; the new Imp is 3 steps away.
    const s = scene({ ann: 'imp', bo: 'm1', cy: 'philosopher', di: 't1', ed: 'scarlet_woman', fi: 't2', gu: 't3' })
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .dawn()
      .dusk()
      .submit({ cy: ['clockmaker'] })
      .review();
    expect(s.truth('cy')).toContain('The Demon is 3 steps from its nearest Minion.');
  });
  it('a Drunk who believes it gets another number the table allows, marked impaired', () => {
    const chars = { ann: 'imp', bo: 'drunk', cy: 't1', di: 't2', ed: 'm1', fi: 't3', gu: 't4' };
    const s = scene(chars, { believed: { bo: 'clockmaker' } }).start();
    expect(s.row('bo').impaired).toBe(true);
    expect(s.row('bo').truth).toEqual(['The Demon is 3 steps from its nearest Minion.']);
    const n = Number(/is (\d+)/.exec(s.row('bo').final[0] as string)?.[1]);
    expect(n).not.toBe(3);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  });
});
