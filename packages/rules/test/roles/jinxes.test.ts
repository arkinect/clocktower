import { describe, expect, it } from 'vitest';
import { allJinxes, allRoles, defaultScript } from '../../src';
import { scene } from '../scenario';

describe('the jinx list', () => {
  it('every jinx is between two registered roles, with its text and source', () => {
    const ids = new Set(allRoles().map((r) => r.id as string));
    expect(allJinxes()).toHaveLength(14);
    for (const j of allJinxes()) {
      expect(ids.has(j.a) && ids.has(j.b)).toBe(true);
      expect(j.text.length).toBeGreaterThan(20);
      expect(j.source).toMatch(/^https:/);
    }
  });
  it('the default script has all 55 roles', () => {
    expect(defaultScript()).toHaveLength(55);
  });
});

describe('Jinx (Cannibal & Butler), (Cannibal & Zealot)', () => {
  it('the Cannibal is told the ability', () => {
    const s = scene({ ann: 'cannibal', bo: 'butler', cy: 'd1', di: 't1', ed: 't2', fi: 't3' }).start().dawn();
    s.execute('bo').nextNight();
    s.dawn();
    expect(s.inbox('ann')).toContain('Jinx (Cannibal & Butler): You have the Butler ability');
  });
  it('a later eat replaces the message waiting to be sent', () => {
    const s = scene({ ann: 'cannibal', bo: 'butler', cy: 'd1', di: 'zealot', ed: 't2', fi: 't3' }).start().dawn();
    s.execute('bo');
    s.act('cannibal', 'set_ability', ['zealot']);
    s.dusk().dawn();
    expect(s.inbox('ann')).toContain('Jinx (Cannibal & Zealot): You have the Zealot ability');
    expect(s.inbox('ann')).not.toContain('Jinx (Cannibal & Butler): You have the Butler ability');
  });
});

describe('Jinx (Cannibal & Juggler)', () => {
  it('a Cannibal who eats the Juggler learns the count', () => {
    const s = scene({ ann: 'cannibal', bo: 'juggler', cy: 'd1', di: 't1', ed: 't2', fi: 't3' }).start().dawn();
    s.act('juggler', 'count', ['2']);
    s.execute('bo').dusk();
    expect(s.truth('ann')).toEqual(['You guessed 2 correctly.']);
  });
  it('with no count entered, a hidden copy sleeps', () => {
    const s = scene({ ann: 'cannibal', bo: 'juggler', cy: 'd1', di: 't1', ed: 't2', fi: 't3' }).start().dawn();
    s.execute('bo').dusk();
    expect(s.truth('ann')).toEqual([]);
  });
});

describe('Jinx (Mathematician & Drunk), (Mathematician & Marionette)', () => {
  it("counts a Drunk's believed ability that gave false information", () => {
    const cast = { ann: 'mathematician', bo: 'drunk', cy: 'imp', di: 't1', ed: 'm1' };
    const s = scene(cast, { believed: { bo: 'empath' } })
      .start()
      .review();
    const row = s.res.results.find((r) => r.playerId === 'bo');
    s.g.st({ type: 'override_result', resultKey: row?.key as string, lines: ['Something else.'] });
    expect(s.truth('ann')).toEqual(["1 player's ability worked abnormally."]);
  });
});

describe('Jinx (Marionette & Balloonist), (Marionette & Huntsman)', () => {
  it('warns of the Outsider a believed Balloonist might have added', () => {
    const s = scene({ ann: 'imp', bo: 'marionette', cy: 't1', di: 't2', ed: 't3' }, { believed: { bo: 'balloonist' } });
    expect(s.g.grimoire().setup.warnings.join(' ')).toContain('Jinx (Marionette & Balloonist)');
  });
  it('requires the Damsel for a believed Huntsman', () => {
    const s = scene({ ann: 'imp', bo: 'marionette', cy: 't1', di: 't2', ed: 't3' }, { believed: { bo: 'huntsman' } });
    expect(s.g.grimoire().setup.checklist.find((c) => c.id === 'jinx:marionette:huntsman')?.done).toBe(false);
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
    s.execute('ann').prompt('yes');
    const token = Object.values(s.state.abilities).find(
      (a) => a.roleId === ('lil_monsta' as never) && a.origin.kind !== 'character',
    );
    expect(token?.holder).toEqual({ kind: 'player', id: 'bo' });
    expect(s.character('bo')).toBe('scarlet_woman');
  });
});

describe('Jinx (Scarlet Woman & Al-Hadikhia)', () => {
  it('the second Demon coming back makes her the Scarlet Woman again', () => {
    const s = scene({ ann: 'al_hadikhia', bo: 'scarlet_woman', cy: 't1', di: 't2', ed: 't3', fi: 't4' }).start().dawn();
    s.execute('ann').prompt('yes');
    expect(s.character('bo')).toBe('al_hadikhia');
    s.dusk()
      .submit({ bo: ['ann', 'cy', 'di'] })
      .review();
    s.answer('ann', ['live']).answer('cy', ['die']).answer('di', ['die']).dawn();
    expect(s.alive('ann')).toBe(true);
    expect(s.character('bo')).toBe('scarlet_woman');
    expect(s.inbox('bo')).toContain('Jinx (Scarlet Woman & Al-Hadikhia): You are the Scarlet Woman again');
  });
});

describe('Jinx (Al-Hadikhia & Mastermind)', () => {
  const cast = { ann: 'al_hadikhia', bo: 'mastermind', cy: 't1', di: 't2', ed: 't3', fi: 't4' };
  const night = () => {
    const s = scene(cast).start().dawn();
    s.execute('ann').dusk();
    return s;
  };
  it('a dead Al-Hadikhia wakes and picks only good players', () => {
    const s = night();
    expect(s.specs('ann')[0]?.fields[0]?.options).toEqual(['cy', 'di', 'ed', 'fi']);
    expect(s.specs('ann')[0]?.allowDecline).toBe(false);
  });
  it('all three live: evil wins', () => {
    const s = night()
      .submit({ ann: ['cy', 'di', 'ed'] })
      .review();
    s.answer('cy', ['live']).answer('di', ['live']).answer('ed', ['live']);
    expect(s.res.gameEnd.find((g) => g.key === 'al_hadikhia_mastermind')?.winner).toBe('evil');
    s.dawn();
    expect(s.alive('cy')).toBe(true);
  });
  it('any die: good wins and nobody dies', () => {
    const s = night()
      .submit({ ann: ['cy', 'di', 'ed'] })
      .review();
    s.answer('cy', ['die']).answer('di', ['live']).answer('ed', ['live']);
    expect(s.res.gameEnd.find((g) => g.key === 'al_hadikhia_mastermind')?.winner).toBe('good');
    s.dawn();
    expect(s.alive('cy')).toBe(true);
  });
  it('not without a living Mastermind', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo').dusk().dawn().execute('ann').dusk();
    expect(s.specs('ann')).toEqual([]);
  });
});
