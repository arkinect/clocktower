import { describe, expect, it } from 'vitest';
import { allJinxes, allRoles, createGame, defaultScript } from '../../src';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

describe('the jinx list', () => {
  it('every jinx is between two different registered roles, once, with its text and source', () => {
    const ids = new Set(allRoles().map((r) => r.id as string));
    expect(allJinxes()).toHaveLength(14);
    for (const j of allJinxes()) {
      expect(ids.has(j.a) && ids.has(j.b)).toBe(true);
      expect(j.text.length).toBeGreaterThan(20);
      expect(j.source).toMatch(/^https:/);
      expect(j.a).not.toBe(j.b);
    }
    const pairs = allJinxes().map((j) => [j.a, j.b].sort().join('+'));
    expect(new Set(pairs).size).toBe(pairs.length);
  });
  it('a new game has all 57 roles on the script', () => {
    expect(defaultScript()).toHaveLength(57);
    expect(allRoles().filter((r) => !r.id.startsWith('t-'))).toHaveLength(57);
    expect(createGame('x', 0).script).toEqual(defaultScript());
  });
});

describe('Jinx (Cannibal & Butler), (Cannibal & Zealot)', () => {
  it('an evil executee shown as a jinxed character is told too, as the Storyteller last chose it', () => {
    const s = scene({ ann: 'cannibal', bo: 'butler', cy: 'd1', di: 'zealot', ed: 'm1', fi: 't3' }).start().dawn();
    s.execute('ed');
    s.act('cannibal', 'fake_eat', ['butler']);
    s.act('cannibal', 'fake_eat', ['zealot']);
    s.dusk().dawn();
    expect(s.inbox('ann')).toContain('Jinx (Cannibal & Zealot): You have the Zealot ability');
    expect(s.inbox('ann')).not.toContain('Jinx (Cannibal & Butler): You have the Butler ability');
  });
});

describe('Jinx (Cannibal & Juggler)', () => {
  const cast = { ann: 'cannibal', bo: 'juggler', cy: 'd1', di: 't1', ed: 't2', fi: 't3' };
  it('a Cannibal who eats the Juggler learns the count of the guesses the dead Juggler enters', () => {
    const s = scene(cast).start().dawn();
    s.act('juggler', 'juggled', ['yes']);
    s.execute('bo').dusk();
    expect(s.specs('ann').map((x) => x.roleId)).not.toContain('juggler');
    expect(s.specs('bo').map((x) => x.roleId)).toEqual(['juggler']);
    s.submit({ bo: ['cy', 'd1', 'di', 't1', 'ed', 't3'] });
    // The bare count: the Cannibal is not told what it counts.
    expect(s.truth('ann')).toEqual(['2']);
    expect(s.truth('bo')).toEqual([]);
  });
  it('a Juggler who did not guess publicly: the hidden copy sleeps, and the dead Juggler is not asked', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo').dusk();
    expect(s.specs('bo')).toEqual([]);
    expect(s.truth('ann')).toEqual([]);
  });
  it('a Juggler executed with no Cannibal to eat them is not asked', () => {
    const s = scene({ ...cast, ann: 't4' })
      .start()
      .dawn();
    s.act('juggler', 'juggled', ['yes']);
    s.execute('bo').dusk();
    expect(s.specs('bo')).toEqual([]);
  });
});

describe("Jinx (Lil' Monsta & Scarlet Woman)", () => {
  it('the Scarlet Woman babysits the token', () => {
    const s = scene(
      { ann: 'lil_monsta', bo: 'scarlet_woman', cy: 'm1', di: 't1', ed: 't2', fi: 't3', gu: 't4' },
      { fields: { lil_monsta: { minion: 'baron' } } },
    )
      .start()
      .dawn();
    s.execute('ann').dusk();
    const token = [...s.state.abilities.values()].find(
      (a) => a.roleId === ('lil_monsta' as never) && a.origin.kind !== 'character',
    );
    expect(token?.holder).toEqual({ kind: 'player', id: pid('bo') });
    expect(s.character('bo')).toBe('scarlet_woman');
  });
  it('the keeper cannot take it back from her', () => {
    const s = scene(
      { ann: 'lil_monsta', bo: 'scarlet_woman', cy: 'm1', di: 't1', ed: 't2', fi: 't3', gu: 't4' },
      { fields: { lil_monsta: { minion: 'baron' } } },
    )
      .start()
      .nextNight();
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    s.execute('cy').dusk();
    expect(s.specs('ann')).toEqual([]);
    s.decide('lil_monsta', 'di').dawn();
    expect(s.alive('di')).toBe(false);
    const token = [...s.state.abilities.values()].find(
      (a) => a.roleId === ('lil_monsta' as never) && a.origin.kind !== 'character',
    );
    expect(token?.holder).toEqual({ kind: 'player', id: pid('bo') });
  });
});
