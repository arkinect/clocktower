import { describe, expect, it } from 'vitest';
import { TRAVELLER } from '../helpers/plain';
import { scene } from '../scenario';

const cast = { ann: 'witch', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
const cursed = () =>
  scene(cast)
    .start()
    .submit({ ann: ['bo'] })
    .dawn();

describe('Witch', () => {
  it('curses a player, who dies when the curse is applied', () => {
    const s = cursed();
    expect(s.act('witch', 'apply_curse', ['bo']).effective).toBe(true);
    expect(s.alive('bo')).toBe(false);
  });
  it('a poisoned Witch curses nobody', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ ann: ['bo'], di: ['ann'] })
      .dawn();
    expect(s.dayActions().filter((d) => d.roleId === 'witch')).toEqual([]);
  });
  it('a recorded nomination alone does nothing', () => {
    const s = cursed();
    s.nominate('bo', 'cy');
    expect(s.alive('bo')).toBe(true);
  });
  it.each([
    ['nobody else', {}],
    ['a Traveller, who does not count', { vi: TRAVELLER[0] as string }],
  ])('stops waking with 3 players alive and %s', (_name, extra) => {
    const s = scene({ ...cast, ...extra })
      .start()
      .dawn()
      .kill('bo')
      .kill('di')
      .dusk();
    expect(s.specs('ann')).toEqual([]);
  });
  it('still wakes and curses with 4 residents and a Traveller alive', () => {
    const s = scene({ ...cast, vi: TRAVELLER[0] as string })
      .start()
      .dawn();
    s.execute('bo').dusk();
    s.submit({ ann: ['ed'] }).dawn();
    expect(s.act('witch', 'apply_curse', ['ed']).effective).toBe(true);
    expect(s.alive('ed')).toBe(false);
  });
});
