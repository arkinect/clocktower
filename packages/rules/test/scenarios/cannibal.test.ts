// The Cannibal in depth: what is eaten, when it starts, what the phone sees, and how it meets the Philosopher.
import { describe, expect, it } from 'vitest';
import { as, row, titles } from './lib';
import { findRole } from '../../src';
import { scene, ST, type Scene } from '../scenario';

const cast = { ann: 'cannibal', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'slayer', fi: 'sailor' };
const day1 = (chars: Record<string, string> = cast, o?: Parameters<typeof scene>[1]) => scene(chars, o).start().dawn();

const gained = (s: Scene, id = 'ann') =>
  Object.values(s.state.abilities).filter(
    (a) =>
      a.holder.kind === 'player' && a.holder.id === id && a.origin.kind !== 'character' && a.activeUntil !== 'removed',
  );
const eatenRoles = (s: Scene, id = 'ann') => gained(s, id).map((a) => a.roleId as string);
/** What an evil eat gives: one good character from the script, other than the Cannibal, only believed. */
const expectFakeGood = (s: Scene, id = 'ann') => {
  const [fake, ...rest] = gained(s, id);
  expect(rest).toEqual([]);
  expect(fake?.perceivedOnly).toBe(true);
  expect(s.state.script).toContain(fake?.roleId);
  expect(['townsfolk', 'outsider']).toContain(findRole(fake?.roleId as string)?.type);
  expect(fake?.roleId).not.toBe('cannibal');
};
const pending = (s: Scene, id: string) => s.state.pendingNotices.filter((n) => n.playerId === id).map((m) => m.title);
const phoneText = (s: Scene, id: string) =>
  JSON.stringify({ ...s.g.view(as(id)), catalog: undefined, script: undefined });

describe('Cannibal eats', () => {
  it('a good executee: their ability from the next night, titled "Cannibal", never named to the phone', () => {
    const s = day1().execute('di').dusk();
    expect(s.row('ann')).toMatchObject({ title: 'Cannibal', roleId: 'empath', impaired: false });
    s.dawn();
    expect(titles(s, 'ann')).toContain('Cannibal');
    expect(
      s.g
        .view(as('ann'))
        .me.messages.map((m) => m.title)
        .join(),
    ).not.toMatch(/Empath/);
  });

  it('an evil executee: a good character from the script, false, and poisoned until a good player dies', () => {
    const s = day1().execute('cy').dusk();
    expectFakeGood(s);
    expect(s.impaired('ann')).toBe(true);
    s.dawn().execute('ed', false).dusk();
    expect(s.impaired('ann')).toBe(true);
    s.dawn().execute('di').dusk();
    expect(s.impaired('ann')).toBe(false);
    expect(eatenRoles(s)).toEqual(['empath']);
  });

  it('an execution that does not kill keeps the ability eaten before', () => {
    const s = day1().execute('di').dusk().dawn().execute('fi', false).dusk();
    expect(eatenRoles(s)).toEqual(['empath']);
  });

  it('the Cannibal executed eats nothing, nor does a Storyteller-marked death feed them', () => {
    const s = day1().execute('ann').dusk();
    expect(eatenRoles(s)).toEqual([]);
    const t = day1();
    t.g.st({ type: 'mark_alive', playerId: as('di'), alive: false });
    t.dusk();
    expect(eatenRoles(t)).toEqual([]);
  });

  it('eating the Slayer gives an unused shot, and eating it again gives a fresh one', () => {
    const s = day1().execute('ed').dusk();
    const shot = () => gained(s)[0];
    expect(shot()?.used).toBeFalsy();
    s.g.st({ type: 'set_ability_used', abilityId: shot()?.id as never, used: true });
    s.dawn();
    s.g.st({ type: 'mark_alive', playerId: as('ed'), alive: true });
    s.execute('ed').dusk();
    expect(shot()?.roleId).toBe('slayer');
    expect(shot()?.used).toBeFalsy();
  });

  it.each(['grandmother', 'clockmaker'])('an eaten %s gives its start information the next night, once', (role) => {
    const s = day1({ ...cast, di: role })
      .execute('di')
      .dusk();
    expect(s.row('ann')).toMatchObject({ title: 'Cannibal', roleId: role, impaired: false });
    s.dawn().dusk();
    expect(s.res.results.some((r) => r.playerId === 'ann')).toBe(false);
  });

  it('a Philosopher who chose the Cannibal eats the day after', () => {
    const s = scene({ ann: 'philosopher', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'sailor' }).start();
    s.submit({ ann: ['cannibal'] })
      .dawn()
      .execute('di')
      .dusk();
    expect(s.row('ann')).toMatchObject({ title: 'Cannibal', roleId: 'empath', impaired: false });
  });

  it.each(['drunk', 'marionette'])('a %s who thinks they are the Cannibal eats too: false, never poisoned', (role) => {
    const chars = { bo: 'imp', ann: role, cy: 'poisoner', di: 'empath', ed: 't1', fi: 'sailor' };
    const s = day1(chars, { believed: { ann: 'cannibal' } })
      .execute('di')
      .dusk();
    expect(s.row('ann')).toMatchObject({ title: 'Cannibal', roleId: 'empath', impaired: true });
    s.dawn().execute('cy').dusk();
    expectFakeGood(s);
    expect(s.state.conditions.filter((c) => c.source?.kind === 'ability' && c.type === 'poisoned')).toEqual([]);
  });
});

describe('choosing what an evil executee looks like, by day', () => {
  const fact = (s: Scene) => s.dayActions().find((d) => d.roleId === 'cannibal');
  const choose = (s: Scene, value: string) => s.act('cannibal', 'fake_eat', [value]);

  it('shows only while an evil player is to be executed, with a suggestion', () => {
    const s = day1();
    expect(fact(s)).toBeUndefined();
    s.execute('di');
    expect(fact(s)).toBeUndefined();
    s.execute('ann');
    expect(fact(s)).toBeUndefined();
    s.execute('cy');
    const f = fact(s);
    expect(f).toMatchObject({ preview: false, action: 'fake_eat', blocksNight: true });
    expect(f?.recorded).toHaveLength(1);
    expect(f?.fields[0]?.options).toContain(f?.recorded?.[0]);
    expect(f?.fields[0]?.options).not.toContain('cannibal');
    expect(f?.fields[0]?.options).not.toContain('imp');
    s.execute(null);
    expect(fact(s)).toBeUndefined();
  });

  it('the preselected suggestion counts as chosen: Start Night goes ahead and dusk uses it', () => {
    const s = day1().execute('cy');
    const suggested = fact(s)?.recorded?.[0];
    s.g.st({ type: 'start_night' });
    expect(eatenRoles(s)).toEqual([suggested]);
    expectFakeGood(s);
  });

  it('nothing waits when the executee is good', () => {
    const s = day1().execute('di');
    s.g.st({ type: 'start_night' });
    expect(eatenRoles(s)).toEqual(['empath']);
  });

  it('the chosen character is what they eat, false, and they are poisoned', () => {
    const s = day1().execute('cy');
    choose(s, 'empath');
    expect(fact(s)?.recorded).toEqual(['empath']);
    s.dusk();
    expect(eatenRoles(s)).toEqual(['empath']);
    expect(s.row('ann')).toMatchObject({ title: 'Cannibal', roleId: 'empath', impaired: true });
    expect(s.impaired('ann')).toBe(true);
  });

  it('a choice is for that executee only', () => {
    const s = day1().execute('cy');
    choose(s, 'empath');
    s.execute('bo');
    expect(fact(s)?.recorded).toHaveLength(1);
    s.execute('cy');
    expect(fact(s)?.recorded).toEqual(['empath']);
  });

  it('refuses a character that is not good, or the Cannibal, and is gone after dusk', () => {
    const s = day1().execute('cy');
    const abilityId = s.ability('cannibal');
    const cmd = (values: string[]) =>
      s.g.tryAs(ST, { type: 'day_action', abilityId, action: 'fake_eat', values, mode: 'accept' }).ok;
    expect(cmd(['imp'])).toBe(false);
    expect(cmd(['cannibal'])).toBe(false);
    expect(cmd(['empath'])).toBe(true);
    s.dusk().dawn();
    expect(cmd(['empath'])).toBe(false);
    expect(fact(s)).toBeUndefined();
  });
});

describe('Cannibal jinxes, as they reach the phone', () => {
  const BUTLER = 'Jinx (Cannibal & Butler): You have the Butler ability';
  const butlerCast = { ...cast, ed: 'butler' };

  it('Jinx (Cannibal & Butler): told when the next night starts, once, and the picker keeps its name', () => {
    const s = day1(butlerCast).execute('ed');
    expect(pending(s, 'ann')).toEqual([]);
    expect(titles(s, 'ann')).not.toContain(BUTLER);
    s.dusk();
    expect(titles(s, 'ann').filter((t) => t === BUTLER)).toHaveLength(1);
    expect(s.specs('ann').map((x) => x.title)).toEqual(['Butler']);
    s.submit({ ann: ['di'] })
      .dawn()
      .dusk();
    expect(titles(s, 'ann').filter((t) => t === BUTLER)).toHaveLength(1);
  });

  it('Jinx (Cannibal & Butler): told when an evil executee is shown as the Butler', () => {
    const s = day1(butlerCast).execute('cy');
    s.act('cannibal', 'fake_eat', ['empath']);
    s.act('cannibal', 'fake_eat', ['butler']);
    expect(pending(s, 'ann')).toEqual([]);
    s.dusk();
    expect(titles(s, 'ann').filter((t) => t === BUTLER)).toHaveLength(1);
    expect(s.specs('ann').map((x) => x.title)).toEqual(['Butler']);
  });

  it('Jinx (Cannibal & Zealot): told when the next night starts', () => {
    const s = day1({ ...cast, ed: 'zealot' })
      .execute('ed')
      .dusk();
    expect(s.inbox('ann')).toContain('If there are 5 or more players alive, you must vote for every nomination.');
  });

  it('Jinx (Cannibal & Juggler): a Juggler executed on a later day gives the Cannibal nothing', () => {
    const s = day1({ ...cast, di: 'juggler' });
    s.act('juggler', 'guesses', ['di', 'juggler']);
    s.dusk().dawn().execute('di').dusk();
    expect(s.truth('ann')).toEqual([]);
  });

  it('Jinx (Cannibal & Juggler): the real Juggler still wakes with no guesses recorded', () => {
    const s = day1({ ...cast, di: 'juggler' }).dusk();
    expect(s.res.results.some((r) => r.playerId === 'di' && r.roleId === 'juggler')).toBe(true);
  });
});

describe('the hidden eaten ability', () => {
  const eater = (role: string) => {
    const s = scene({ ann: 'cannibal', bo: 'imp', cy: 'poisoner', di: role, ed: 'empath', fi: 'butler' }).start();
    return s.dawn().execute('di').dusk();
  };

  /** A Drunk who thinks they are the Cannibal, eating the evil Poisoner shown as what `fi` really has. */
  const believer = (role: string) => {
    const s = scene(
      { ann: 'drunk', bo: 'imp', cy: 'poisoner', di: 't1', ed: 't2', fi: role },
      { believed: { ann: 'cannibal' } },
    ).start();
    s.dawn().execute('cy');
    s.act('cannibal', 'fake_eat', [role]);
    return s.dusk();
  };

  it('a believed Cannibal: the picker goes by "cannibal" and the real holder is untouched', () => {
    const s = believer('fortune_teller');
    expect(s.specs('ann').map((x) => [x.roleId, x.title])).toEqual([['cannibal', 'Cannibal']]);
    expect(s.specs('fi').map((x) => [x.roleId, x.title])).toEqual([['fortune_teller', 'Fortune Teller']]);
  });

  it('a believed Cannibal who ate the Butler has a named picker, which the Cannibal learns', () => {
    const s = scene(
      { ann: 'drunk', bo: 'imp', cy: 'poisoner', di: 'butler', ed: 'empath', fi: 't1' },
      { believed: { ann: 'cannibal' } },
    ).start();
    s.dawn().execute('di').dusk();
    expect(s.specs('ann').map((x) => [x.roleId, x.title])).toEqual([['butler', 'Butler']]);
  });

  it('a false result differs from the truth and keeps the Storyteller row by the real role', () => {
    const s = believer('empath');
    expect(s.row('ann')).toMatchObject({ roleId: 'empath', title: 'Cannibal', impaired: true });
    expect(s.row('ann').suggested).not.toEqual(s.row('ann').truth);
    expect(s.row('fi').title).toBe('Empath');
  });

  it('the role id appears nowhere on the phone, and the submission reaches the eaten role', () => {
    const s = eater('fortune_teller');
    expect(s.specs('ann').map((x) => [x.roleId, x.title])).toEqual([['cannibal', 'Cannibal']]);
    s.submit({ ann: ['bo', 'ed'] });
    expect(phoneText(s, 'ann')).not.toMatch(/fortune_teller|Fortune Teller/);
    s.review();
    expect(phoneText(s, 'ann')).not.toMatch(/fortune_teller|Fortune Teller/);
    expect(s.row('ann').truth).toEqual(['bo and ed: Yes, one of them is a Demon.']);
    expect(row(s, 'ann')?.roleId).toBe('fortune_teller');
    s.dawn();
    expect(phoneText(s, 'ann')).not.toMatch(/fortune_teller|Fortune Teller/);
  });

  it('a follow-up question from a hidden ability is titled as the Cannibal', () => {
    const s = eater('ravenkeeper')
      .submit({ bo: ['ann'] })
      .review();
    expect(s.res.questions.map((q) => [q.roleId, q.spec.roleId, q.spec.title])).toEqual([
      ['ravenkeeper', 'cannibal', 'Cannibal'],
    ]);
    expect(phoneText(s, 'ann')).not.toMatch(/ravenkeeper|Ravenkeeper/);
    s.answer('ann', ['bo']);
    expect(s.row('ann').title).toBe('Cannibal');
    s.dawn();
    expect(phoneText(s, 'ann')).not.toMatch(/ravenkeeper|Ravenkeeper/);
  });

  it('the Storyteller view names the eaten role, and keeps the submission as sent', () => {
    const s = eater('fortune_teller')
      .submit({ ann: ['bo', 'ed'] })
      .review();
    const review = s.g.grimoire().review;
    expect(review?.results.find((r) => r.playerId === 'ann')).toMatchObject({
      roleId: 'fortune_teller',
      title: 'Cannibal',
    });
    expect(review?.actors.find((a) => a.playerId === 'ann')?.roleId).toBe('fortune_teller');
    expect(Object.values(s.night.submissions['ann' as never]?.actions ?? {})).toEqual([{ values: ['bo', 'ed'] }]);
  });
});

describe('the Cannibal and the Philosopher', () => {
  const roles = {
    ann: 'philosopher',
    bo: 'cannibal',
    cy: 'imp',
    di: 'poisoner',
    ed: 'empath',
    fi: 'fortune_teller',
    gus: 'slayer',
    hal: 'butler',
  };
  const hasFt = (s: Scene) => eatenRoles(s, 'bo').includes('fortune_teller');

  /** Day 2: the Philosopher chose the Empath and was executed; the Cannibal ate them and chose the Fortune Teller. */
  function cannibalChoseFt() {
    const s = scene(roles).start();
    s.submit({ ann: ['empath'] }).dawn();
    expect(s.impaired('ed')).toBe(true);
    s.execute('ann').dusk();
    expect(s.impaired('ed')).toBe(false);
    expect(s.specs('bo').map((x) => x.title)).toEqual(['Cannibal']);
    s.submit({ bo: ['fortune_teller'] }).dawn();
    expect(s.impaired('fi')).toBe(true);
    return s;
  }

  it('what they chose lasts until the next eat, which ends it and the drunkenness', () => {
    const s = cannibalChoseFt();
    s.dusk();
    expect(hasFt(s)).toBe(true);
    s.dawn().dusk().dawn();
    expect(s.impaired('fi')).toBe(true);
    s.execute('gus').dusk();
    expect(eatenRoles(s, 'bo')).toEqual(['slayer']);
    expect(s.impaired('fi')).toBe(false);
    expect(hasFt(s)).toBe(false);
    expect(s.specs('bo').map((x) => x.roleId)).not.toContain('fortune_teller');
  });

  it('an evil eat ends it too', () => {
    const s = cannibalChoseFt().execute('cy').dusk();
    expect(hasFt(s)).toBe(false);
    expect(s.impaired('fi')).toBe(false);
  });

  it('a Philosopher with the Cannibal keeps it when what they ate changes, and the real Cannibal stays drunk', () => {
    const s = scene(roles).start();
    s.submit({ ann: ['cannibal'] })
      .dawn()
      .execute('gus')
      .dusk()
      .dawn()
      .execute('hal')
      .dusk();
    expect(eatenRoles(s)).toContain('cannibal');
    expect(eatenRoles(s)).toContain('butler');
    expect(eatenRoles(s)).not.toContain('slayer');
    expect(s.impaired('bo')).toBe(true);
  });

  it('a Philosopher who chose the Cannibal and eats the executed real Cannibal gains nothing new', () => {
    const s = scene(roles).start();
    s.submit({ ann: ['cannibal'] })
      .dawn()
      .execute('gus')
      .dusk();
    expect(eatenRoles(s)).toContain('slayer');
    s.dawn().execute('bo').dusk();
    expect([...new Set(eatenRoles(s))]).toEqual(['cannibal']);
    expect(s.specs('ann')).toEqual([]);
  });
});
