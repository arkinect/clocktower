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
    expect(s.act('damsel', 'guess', ['yes']).effective).toBe(true);
    expect(s.winners()).toContain('evil');
  });
  it('only a right guess is recorded, as yes or no, and it is spent', () => {
    const s = scene(cast).start().dawn();
    const row = s.dayActions().find((d) => d.roleId === 'damsel');
    expect(row).toMatchObject({ title: 'Damsel (ann)', preview: true, emptyLabel: 'No', order: 50 });
    expect(row?.fields[0]?.options).toEqual(['yes']);
    s.act('damsel', 'guess', ['yes']);
    expect(s.dayActions()[0]?.recorded).toEqual(['yes']);
    s.dusk().dawn();
    expect(s.dayActions()).toEqual([]);
  });
  it('a second Use takes it back: no win, and the guess is not spent', () => {
    const s = scene(cast).start().dawn();
    s.act('damsel', 'guess', ['yes']);
    s.act('damsel', 'guess', []);
    expect(s.winners()).not.toContain('evil');
    expect(s.dayActions()[0]?.recorded).toBeNull();
  });
  it('a right guess of a dead Damsel does nothing', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'ann' as never, alive: false });
    expect(s.act('damsel', 'guess', ['yes']).effective).toBe(false);
    expect(s.winners()).not.toContain('evil');
  });
  it('the guess outlives the character', () => {
    const s = scene({ ...cast, di: 'huntsman' })
      .start()
      .submit({ di: ['ann'] })
      .decide('huntsman_new_role', 'empath');
    s.dawn();
    expect(s.dayActions().map((d) => d.title)).toContain('Damsel');
  });
});
