import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'huntsman', bo: 'damsel', cy: 'imp', di: 'm1', ed: 't3' };
describe('Huntsman', () => {
  it('turns the Damsel into a Townsfolk not in play', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .review();
    // The same answer whether or not they hit.
    expect(s.truth('ann')).toEqual(['You chose bo.']);
    expect(['huntsman', 'damsel']).not.toContain(s.decision('huntsman_new_role').default);
    s.decide('huntsman_new_role', 'empath').dawn();
    expect(s.character('bo')).toBe('empath');
    expect(s.inbox('bo')).toContain('Your role is now Empath');
    s.nextNight();
    expect(s.truth('bo')).toHaveLength(1);
  });
  it('a miss spends the use', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['ed'] });
    expect(s.truth('ann')).toEqual(['You chose ed.']);
    s.nextNight();
    expect(s.specs('ann')).toEqual([]);
    expect(s.character('bo')).toBe('damsel');
  });
});
