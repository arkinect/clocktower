import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Clockmaker', () => {
  it('counts the steps from the Demon to the nearest Minion', () => {
    const s = scene({ ann: 'clockmaker', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' }).start();
    expect(s.truth('ann')).toEqual(['The Demon is 2 steps from its nearest Minion.']);
  });
  it('wakes on Night 0 only', () => {
    const s = scene({ ann: 'clockmaker', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' }).start();
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
  it('a Drunk who believes it gets something false, marked impaired', () => {
    const s = scene(
      { ann: 'drunk', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' },
      { believed: { ann: 'clockmaker' } },
    ).start();
    expect(s.row('ann').impaired).toBe(true);
    expect(s.row('ann').final).not.toEqual(['The Demon is 2 steps from its nearest Minion.']);
  });
});
