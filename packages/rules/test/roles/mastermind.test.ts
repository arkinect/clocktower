import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'mastermind', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Mastermind', () => {
  it('holds the game for a day after the Demon is executed', () => {
    const s = scene(cast).start().dawn();
    s.execute('cy').dusk();
    expect(s.state.gameEnd).toEqual([]);
    expect(s.state.phase).toMatchObject({ kind: 'night', n: 1 });
  });
  it('the next execution decides it', () => {
    const s = scene(cast).start().dawn();
    s.execute('cy').dusk().dawn().execute('bo').dusk();
    expect(s.winners()).toContain('evil');
  });
  it('a dead Mastermind holds nothing', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann').dusk().dawn().execute('cy').dusk();
    expect(s.winners()).toContain('good');
  });
});
