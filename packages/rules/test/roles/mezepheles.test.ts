import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'mezepheles', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
const opts = { fields: { mezepheles: { word: 'apple' } } };
describe('Mezepheles', () => {
  it('knows the word', () => {
    expect(scene(cast, opts).start().inbox('ann')).toContain('The word is: apple');
  });
  it('turns the first good player to say it evil that night', () => {
    const s = scene(cast, opts).start().dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk().dawn();
    expect(s.alignment('bo')).toBe('evil');
    expect(s.inbox('bo')).toContain('You are now evil.');
  });
  it('a recorded speaker can be cleared before dusk', () => {
    const s = scene(cast, opts).start().dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.act('mezepheles', 'sayer', []);
    expect(s.dayActions().find((d) => d.roleId === 'mezepheles')?.recorded).toBeNull();
    s.dusk().dawn();
    expect(s.alignment('bo')).toBe('good');
  });
  it('a poisoned Mezepheles spends the word', () => {
    const s = scene({ ...cast, di: 'poisoner' }, opts)
      .start()
      .dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.alignment('bo')).toBe('good');
    expect(s.dayActions()).toEqual([]);
  });
});
