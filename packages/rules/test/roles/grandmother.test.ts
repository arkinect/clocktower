import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'grandmother', bo: 'empath', cy: 'imp', di: 't2', ed: 't3' };
describe('Grandmother', () => {
  it('learns a good player and their character', () => {
    const s = scene(cast).start().decide('grandmother_grandchild', 'bo');
    expect(s.truth('ann')).toEqual(['Your grandchild is bo, the Empath.']);
  });
  it('dies with the grandchild when the Demon kills them', () => {
    const s = scene(cast)
      .start()
      .decide('grandmother_grandchild', 'bo')
      .nextNight()
      .submit({ cy: ['bo'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
    expect(s.g.player('ann' as never).life.cause).toBe('grandchild_link');
  });
  it('not when the grandchild is executed', () => {
    const s = scene(cast).start().decide('grandmother_grandchild', 'bo').dawn();
    s.execute('bo').dusk().dawn();
    expect(s.alive('ann')).toBe(true);
  });
});
