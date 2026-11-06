import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2', ed: 't3', fi: 't4' };
describe('Scarlet Woman', () => {
  it('takes over when the Demon is executed with 5 or more alive', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann').prompt('yes');
    expect(s.character('bo')).toBe('imp');
    s.dusk();
    expect(s.inbox('bo')).toContain('You are now the Imp');
  });
  it('holds the game end while the Storyteller decides', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann');
    expect(s.state.gameEnd).toEqual([]);
    s.prompt('no');
    expect(s.winners()).toContain('good');
  });
  it('not with fewer than 5 alive', () => {
    const s = scene({ ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2' }).start().dawn();
    s.execute('ann');
    expect(s.state.prompts).toEqual([]);
    expect(s.character('bo')).toBe('scarlet_woman');
  });
  it('catches a night kill of the Demon', () => {
    const s = scene({ ...cast, cy: 'assassin' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .dawn();
    expect(s.character('bo')).toBe('imp');
  });
  it('a poisoned Scarlet Woman does nothing', () => {
    const s = scene({ ...cast, cy: 'poisoner' })
      .start()
      .submit({ cy: ['bo'] })
      .dawn();
    s.execute('ann');
    expect(s.state.prompts).toEqual([]);
  });
});
