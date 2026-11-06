import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'fool', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Fool', () => {
  it('survives the first death only', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(true);
    s.dusk()
      .submit({ cy: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
  });
  it('an impaired Fool keeps the save', () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'], bo: ['ann'] });
    s.dawn();
    expect(s.alive('ann')).toBe(false);
    expect(Object.values(s.state.abilities).find((a) => a.roleId === ('fool' as never))?.used).toBe(false);
  });
});
