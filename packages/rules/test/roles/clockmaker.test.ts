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
  it('a Drunk who believes it gets something false, marked impaired', () => {
    const s = scene(
      { ann: 'drunk', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' },
      { believed: { ann: 'clockmaker' } },
    ).start();
    expect(s.row('ann').impaired).toBe(true);
    expect(s.row('ann').final).not.toEqual(['The Demon is 2 steps from its nearest Minion.']);
  });
});
