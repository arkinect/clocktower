import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'imp', bo: 'm1', cy: 't1', di: 't2', ed: 'scarlet_woman', fi: 't3' };
describe('Imp', () => {
  it('kills from the first night after', () => {
    const s = scene(cast).start();
    expect(s.specs('ann')).toEqual([]);
    s.nextNight()
      .submit({ ann: ['cy'] })
      .dawn();
    expect(s.alive('cy')).toBe(false);
  });
  it('starpasses to the Scarlet Woman first', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .dawn();
    expect(s.character('ed')).toBe('imp');
    expect(s.alive('ann')).toBe(false);
    expect(s.inbox('ed')).toContain('You are now the Imp');
  });
  it('the Storyteller picks the Minion', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .decide('starpass', 'bo')
      .dawn();
    expect(s.character('bo')).toBe('imp');
    expect(s.alignment('bo')).toBe('evil');
  });
  it('no kill when poisoned', () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .nextNight()
      .submit({ ann: ['cy'], bo: ['ann'] })
      .dawn();
    expect(s.alive('cy')).toBe(true);
  });
});
