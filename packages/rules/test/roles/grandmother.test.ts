import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

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
    expect(s.g.player(pid('ann') as never).life.cause).toBe('grandchild_link');
  });
  it('not when the grandchild is executed', () => {
    const s = scene(cast).start().decide('grandmother_grandchild', 'bo').dawn();
    s.execute('bo').dusk().dawn();
    expect(s.alive('ann')).toBe(true);
  });
  it('not when an Assassin kills them', () => {
    const s = scene({ ...cast, di: 'assassin' })
      .start()
      .decide('grandmother_grandchild', 'bo')
      .nextNight()
      .submit({ di: ['bo'] })
      .review();
    expect(s.res.deaths).toEqual([pid('bo')]);
  });
  it('poisoned on night 0, they get false information and no link', () => {
    const s = scene({ ann: 'grandmother', bo: 'empath', cy: 'imp', di: 'poisoner', ed: 'butler' })
      .start()
      .submit({ di: ['ann'] });
    expect(s.row('ann').impaired).toBe(true);
    s.nextNight()
      .submit({ cy: ['bo'] })
      .review();
    expect(s.res.deaths).toEqual([pid('bo')]);
  });
});
