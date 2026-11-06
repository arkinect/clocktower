import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'witch', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
describe('Witch', () => {
  it('curses a player, who dies if they nominate', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    s.nominate('bo', 'cy').prompt('yes');
    expect(s.alive('bo')).toBe(false);
  });
  it('nothing happens to others who nominate', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    s.nominate('di', 'cy');
    expect(s.state.prompts).toEqual([]);
  });
  it('the curse can also be applied from the day panel', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    s.act('witch', 'apply_curse', ['bo']);
    expect(s.alive('bo')).toBe(false);
  });
  it('stops waking with 3 players alive', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo').g.st({ type: 'mark_alive', playerId: 'di' as never, alive: false });
    s.dusk();
    expect(s.specs('ann')).toEqual([]);
  });
});
