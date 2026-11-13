import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Balloonist', () => {
  it('adds an Outsider at setup', () => {
    const s = scene({ ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' });
    expect(s.g.grimoire().setup.counts.target).toEqual([2, 1, 1, 1]);
  });
  it('adds no Outsider when the Storyteller chooses +0', () => {
    const s = scene(
      { ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' },
      { fields: { balloonist: { outsiders: '+0' } } },
    );
    expect(s.g.grimoire().setup.counts.target).toEqual([3, 0, 1, 1]);
  });
  it('adds one when the Storyteller chooses +1', () => {
    const s = scene(
      { ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' },
      { fields: { balloonist: { outsiders: '+1' } } },
    );
    expect(s.g.grimoire().setup.counts.target).toEqual([2, 1, 1, 1]);
  });
  it('holds setup until the choice is made', () => {
    const item = (s: ReturnType<typeof scene>) => s.g.grimoire().setup.checklist.find((c) => c.id === 'balloonist');
    const unset = scene({ ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' });
    expect(item(unset)).toMatchObject({ done: false, blocking: true });
    const set = scene(
      { ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' },
      { fields: { balloonist: { outsiders: '+0' } } },
    );
    expect(item(set)).toMatchObject({ done: true, label: 'Balloonist: Outsiders +0 or +1 (chosen: +0)' });
  });
  it('leaves the Godfather no Outsider to remove after +0', () => {
    const s = scene(
      { ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'godfather' },
      { fields: { balloonist: { outsiders: '+0' } } },
    );
    const field = s.g.grimoire().setup.fields.find((f) => f.title.startsWith('Godfather'));
    expect(field?.options.map((o) => o.id)).toEqual(['+1']);
  });
  it('shows a new type each night, then nothing', () => {
    const s = scene({ ann: 'balloonist', bo: 't1', cy: 'd1' }).start();
    s.decide('balloonist', 'bo');
    expect(s.truth('ann')).toEqual(['bo']);
    s.nextNight().decide('balloonist', 'cy');
    expect(s.truth('ann')).toEqual(['cy']);
    s.nextNight();
    expect(s.truth('ann')).toEqual(['You learn nothing new.']);
  });
  it('flags a written answer as out of date when a decision changes the true answer under it', () => {
    const s = scene(
      { ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' },
      { fields: { balloonist: { outsiders: '+0' } } },
    )
      .start()
      .review();
    const d = s.decision('balloonist');
    s.g.st({ type: 'override_result', resultKey: s.row('ann').key, lines: ['A written answer'] });
    expect(s.row('ann').staleOverride).toBe(false);
    const other = d.options.find((o) => o.id !== d.default)?.id as string;
    s.decide('balloonist', other);
    expect(s.row('ann')).toMatchObject({ final: ['A written answer'], staleOverride: true });
  });
});
