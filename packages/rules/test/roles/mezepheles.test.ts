import type { PlayerId } from '@ct/protocol';
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
  it('asks the Storyteller nothing at night: the outcome follows from the Day tab', () => {
    const s = scene(cast, opts).start().dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk().review();
    expect(s.hasDecision('mezepheles')).toBe(false);
  });
  it('an impaired Mezepheles asks nothing', () => {
    const s = scene(cast, opts).start().dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk();
    s.g.st({ type: 'add_condition', target: 'ann' as PlayerId, condition: 'poisoned' });
    s.review();
    expect(s.hasDecision('mezepheles')).toBe(false);
  });
  it('does not turn an evil speaker', () => {
    const s = scene(cast, opts).start().dawn();
    s.act('mezepheles', 'sayer', ['cy']);
    s.dusk().dawn();
    expect(s.alignment('cy')).toBe('evil');
    expect(s.inbox('cy')).not.toContain('You are now evil.');
  });
  it('a Mezepheles made drunk the night after the word is said spends it with no effect', () => {
    const s = scene(cast, opts).start().dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk();
    s.g.st({ type: 'add_condition', target: 'ann' as PlayerId, condition: 'drunk' });
    s.dawn();
    expect(s.alignment('bo')).toBe('good');
    expect(s.inbox('bo')).not.toContain('You are now evil.');
    expect(s.dayActions()).toEqual([]);
  });
  it('a recorded speaker can be cleared before dusk', () => {
    const s = scene(cast, opts).start().dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.act('mezepheles', 'sayer', []);
    expect(s.dayActions().find((d) => d.roleId === 'mezepheles')?.recorded).toBeNull();
    s.dusk().dawn();
    expect(s.alignment('bo')).toBe('good');
  });
  it('poisoned the night after the word is said: the word is spent with no effect', () => {
    const s = scene({ ...cast, di: 'poisoner' }, opts)
      .start()
      .dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.alignment('bo')).toBe('good');
    expect(s.inbox('bo')).not.toContain('You are now evil.');
    expect(s.dayActions()).toEqual([]);
  });
});
