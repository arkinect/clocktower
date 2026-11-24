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
  it('a Mastermind poisoned at the execution holds nothing, even if healthy that night', () => {
    const s = scene({ ...cast, di: 'poisoner', ed: 't2', fi: 't3' })
      .start()
      .submit({ di: ['ann'] })
      .dawn();
    s.execute('cy').dusk();
    expect(s.impaired('ann')).toBe(false);
    expect(s.winners()).toEqual(['good']);
  });
  it('a Mastermind poisoned by the Demon who is executed holds nothing', () => {
    const s = scene({ ...cast, cy: 'pukka' })
      .start()
      .submit({ cy: ['ann'] })
      .dawn();
    s.execute('cy').dusk();
    expect(s.winners()).toEqual(['good']);
  });
  it('a Mastermind poisoned only the night after still has the extra day', () => {
    const s = scene({ ...cast, di: 'poisoner', ed: 't2', fi: 't3' })
      .start()
      .dawn();
    s.execute('cy')
      .dusk()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.state.gameEnd).toEqual([]);
    expect(s.impaired('ann')).toBe(true);
    s.execute('bo').dusk();
    expect(s.winners()).toContain('evil');
  });
  it('a dead Mastermind holds nothing', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann').dusk().dawn().execute('cy').dusk();
    expect(s.winners()).toContain('good');
  });
});
