import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'huntsman', bo: 'damsel', cy: 'imp', di: 'm1', ed: 't3' };
describe('Huntsman', () => {
  it('needs the Damsel on the setup checklist', () => {
    const s = scene({ ...cast, bo: 't1' });
    expect(s.g.grimoire().setup.checklist.some((c) => !c.done && c.label.includes('Damsel'))).toBe(true);
  });
  it('turns the Damsel into a Townsfolk not in play', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .decide('huntsman_new_role', 'empath')
      .dawn();
    expect(s.character('bo')).toBe('empath');
    expect(s.inbox('bo')).toContain('Your role is now Empath');
    s.nextNight();
    expect(s.truth('bo')).toHaveLength(1);
  });
  it('a miss spends the use', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['ed'] })
      .nextNight();
    expect(s.specs('ann')).toEqual([]);
    expect(s.character('bo')).toBe('damsel');
  });
});
