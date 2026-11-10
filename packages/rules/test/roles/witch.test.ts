import { describe, expect, it } from 'vitest';
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
});
