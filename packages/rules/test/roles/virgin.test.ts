import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'virgin', bo: 't1', cy: 'imp', di: 'm1', ed: 't3' };
describe('Virgin', () => {
  it('a Townsfolk nominator is executed', () => {
    const s = scene(cast).start().dawn();
    s.nominate('bo', 'ann').prompt('yes');
    expect(s.alive('bo')).toBe(false);
    expect(s.g.player('bo' as never).life.cause).toBe('execution');
  });
  it('only the first nomination counts', () => {
    const s = scene(cast).start().dawn();
    s.nominate('di', 'ann');
    expect(s.state.prompts).toEqual([]);
    s.nominate('bo', 'ann');
    expect(s.state.prompts).toEqual([]);
  });
  it('an impaired Virgin spends the use for nothing', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['ann'] })
      .dawn();
    s.nominate('bo', 'ann');
    expect(s.state.prompts).toEqual([]);
  });
});
