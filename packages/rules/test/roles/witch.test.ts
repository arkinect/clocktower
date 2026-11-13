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
  it('is a switch: pressing it again takes it back, reviving them and cursing them again', () => {
    const s = cursed();
    const row = () => s.dayActions().find((d) => d.roleId === 'witch');
    expect(row()).toMatchObject({ control: 'toggle', preview: true, recorded: null, order: 70 });
    s.act('witch', 'apply_curse', ['bo']);
    expect(s.alive('bo')).toBe(false);
    expect(row()?.recorded).toEqual(['bo']);
    expect(s.act('witch', 'apply_curse', ['bo']).summary).toBe('Taken back: bo is cursed again and alive.');
    expect(s.alive('bo')).toBe(true);
    expect(row()?.recorded).toBeNull();
    s.act('witch', 'apply_curse', ['bo']);
    expect(s.alive('bo')).toBe(false);
  });
  it('a recorded nomination alone does nothing', () => {
    const s = cursed();
    s.nominate('bo', 'cy');
    expect(s.state.prompts).toEqual([]);
    expect(s.alive('bo')).toBe(true);
  });
  it('a preview changes nothing', () => {
    const s = cursed();
    s.act('witch', 'apply_curse', ['bo'], { mode: 'preview' });
    expect(s.alive('bo')).toBe(true);
    expect(s.dayActions().filter((d) => d.roleId === 'witch')).toHaveLength(1);
  });
  it('the Storyteller can force a survival', () => {
    const s = cursed();
    s.act('witch', 'apply_curse', ['bo'], { mode: 'force_fail' });
    expect(s.alive('bo')).toBe(true);
  });
  it('stops waking with 3 players alive', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo').g.st({ type: 'mark_alive', playerId: 'di' as never, alive: false });
    s.dusk();
    expect(s.specs('ann')).toEqual([]);
  });
  it('does not count Travellers: 3 residents and a Traveller alive is not enough', () => {
    const s = scene({ ...cast, vi: TRAVELLER[0] as string })
      .start()
      .dawn();
    s.execute('bo').g.st({ type: 'mark_alive', playerId: 'di' as never, alive: false });
    s.dusk();
    expect(s.state.seats.filter((x) => s.alive(x.playerId))).toHaveLength(4);
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
