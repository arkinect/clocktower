import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { nameOf, pid } from '../helpers/game';

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
  it('shows a type different from last night, and may return to an earlier one', () => {
    const s = scene({ ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2' }).start();
    s.decide('balloonist', 'bo');
    expect(s.truth('ann')).toEqual(['bo']);
    s.nextNight();
    expect(s.decision('balloonist').options.map((o) => o.id)).toEqual([pid('cy')]);
    expect(s.truth('ann')).toEqual(['cy']);
    s.nextNight();
    expect(s.decision('balloonist').options.map((o) => o.id)).toEqual([pid('bo'), pid('di')]);
  });
  it('when impaired, the false name is picked with the result rather than as a decision', () => {
    const s = scene(
      { ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'poisoner' },
      { fields: { balloonist: { outsiders: '+0' } } },
    )
      .start()
      .submit({ ed: ['ann'] })
      .review();
    expect(s.hasDecision('balloonist')).toBe(false);
    const row = s.row('ann');
    expect(row).toMatchObject({ impaired: true, confirmation: false });
    expect(row.alternatives).toEqual([['bo'], ['cy'], ['di'], ['ed']]);
    expect(row.alternatives).toContainEqual(row.final);
    // Tomorrow's type differs from whoever the answer that went out named.
    s.g.st({ type: 'override_result', resultKey: row.key, lines: ['cy'] });
    s.nextNight();
    expect(s.decision('balloonist').options.map((o) => o.id)).toEqual([pid('bo'), pid('di'), pid('ed')]);
  });
  it("counts whoever babysits Lil' Monsta as the Demon, and the Minion who chooses as a Minion", () => {
    const cast = { ann: 'lil_monsta', bo: 'balloonist', cy: 't1', di: 't2', ed: 't3', fi: 't4', gu: 't5' };
    const s = scene(cast, { fields: { lil_monsta: { minion: 'baron' }, balloonist: { outsiders: '+0' } } }).start();
    const labels = () =>
      Object.fromEntries(s.decision('balloonist').options.map((o) => [nameOf(o.id), /\((.*)\)/.exec(o.label)?.[1]]));
    const night = (sitter: string) =>
      s
        .nextNight()
        .submit({ ann: [sitter] })
        .decide('lil_monsta', 'none');
    // Night 0: still the Lil' Monsta character.
    expect(labels()).toMatchObject({ ann: 'demon' });
    s.decide('balloonist', 'cy');
    // The keeper babysits: a Minion character, but the Demon.
    night('ann');
    expect(labels()).toEqual({ ann: 'demon' });
    // A Townsfolk babysits: they are the Demon, and the keeper is only a Minion.
    night('di');
    expect(labels()).toMatchObject({ ann: 'minion', cy: 'townsfolk' });
    expect(labels()).not.toHaveProperty('di');
    s.decide('balloonist', 'ann');
    night('di');
    expect(labels()).toMatchObject({ di: 'demon', cy: 'townsfolk' });
    expect(labels()).not.toHaveProperty('ann');
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
