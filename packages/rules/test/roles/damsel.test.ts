import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'damsel', bo: 'm1', cy: 'imp', di: 't1', ed: 't3' };
describe('Damsel', () => {
  it('all Minions learn one is in play', () => {
    const s = scene(cast).start();
    expect(s.inbox('bo')).toContain('A Damsel is in play.');
    expect(s.inbox('di')).not.toContain('A Damsel is in play.');
  });
  it('a right guess offers evil the win', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('damsel', 'guess', ['ann']).effective).toBe(true);
    expect(s.winners()).toContain('evil');
  });
  it('a wrong guess is spent', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('damsel', 'guess', ['di']).effective).toBe(false);
    expect(s.dayActions()).toEqual([]);
  });
  it('the guess outlives the character', () => {
    const s = scene({ ...cast, di: 'huntsman' })
      .start()
      .submit({ di: ['ann'] })
      .decide('huntsman_new_role', 'empath');
    s.dawn();
    expect(s.dayActions().map((d) => d.title)).toContain('Damsel guess');
  });
});
