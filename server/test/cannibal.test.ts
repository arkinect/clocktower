// The Cannibal (design.md section 14.4): eating when an execution kills, the poison after an evil eat, the
// Storyteller's change in the Day panel (set_cannibal_ability), and the Cannibal's jinxes (14.8).
import { describe, expect, it } from 'vitest';
import { abilitiesOf } from '@ct/shared';
import { act, build, nextNight, resolve, resultFor, runNight, submit, tryAct, type TestGame } from './helpers';
import { actionSpecs, wakingRoles } from '../src/engine/actions';
import { bluffCandidates, enabledRoles } from '../src/engine/setup';
import { adminView, playerView } from '../src/engine/views';
import { computeImpairment } from '../src/engine/impairment';
import { startInfoPending } from '../src/engine/world';

const NEW = ['cannibal', 'farmer'];

/** Night 0 run and published: Day 1. */
function day1(roles: string[], extra?: (g: TestGame) => void): TestGame {
  const g = build(roles, extra);
  runNight(g, {});
  return g;
}

const execute = (g: TestGame, pid: string, died = true) => act(g, { type: 'record_execution', playerId: pid, died });
const eaten = (g: TestGame, pid: string) => g.s.assignments[pid].eatenAbility;
const cannibalPoison = (g: TestGame, pid: string) => g.s.effects.filter((e) => e.cause === 'cannibal' && e.targetPlayerId === pid);
const titles = (g: TestGame, pid: string) => (g.s.messages[pid] ?? []).map((m) => m.title);
const queued = (g: TestGame, pid: string) => (g.s.pendingNotices[pid] ?? []).map((m) => m.title);

describe('script', () => {
  it('a game whose script lacks the Cannibal and Farmer never offers them', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler', 'gambler', 'sailor'], (g) => {
      for (const r of NEW) act(g, { type: 'set_role_enabled', roleId: r, enabled: false });
    });
    expect(enabledRoles(g.s).filter((r) => NEW.includes(r))).toEqual([]);
    expect(bluffCandidates(g.s).filter((r) => NEW.includes(r))).toEqual([]);
    expect(actionSpecs(g.s, g.p.philosopher)[0].fields[0].options.filter((r) => NEW.includes(r))).toEqual([]);
    runNight(g, {});
    nextNight(g);
    expect(actionSpecs(g.s, g.p.gambler)[0].fields[1].options.filter((r) => NEW.includes(r))).toEqual([]);
    expect(tryAct(g, { type: 'assign_role', playerId: g.p.empath, roleId: 'cannibal' }).ok).toBe(false);
    expect(tryAct(g, { type: 'assign_role', playerId: g.p.empath, roleId: 'farmer' }).ok).toBe(false);
  });
});

describe('Cannibal eats', () => {
  /** Seats: Cannibal, Imp, Poisoner, Empath, Slayer, Sailor. */
  const roles = ['cannibal', 'imp', 'poisoner', 'empath', 'slayer', 'sailor'];

  it('a good executee: the Cannibal uses their ability from the next night, titled "Cannibal"', () => {
    const g = day1(roles);
    execute(g, g.p.empath);
    expect(eaten(g, g.p.cannibal)).toEqual({ roleId: 'empath', fromNight: 1, executeeId: g.p.empath, fake: false });
    expect(abilitiesOf(g.s, g.p.cannibal, 0).map((x) => x.roleId)).toEqual(['cannibal']);
    nextNight(g);
    const res = resolve(g);
    const row = resultFor(res, g.p.cannibal, 'empath')!;
    expect(row).toMatchObject({ title: 'Cannibal', impaired: false });
    act(g, { type: 'publish_night', force: true });
    expect(titles(g, g.p.cannibal)).toContain('Cannibal');
    expect(JSON.stringify(playerView(g.s, g.p.cannibal, 0).me.messages)).not.toMatch(/Empath|empath/);
  });

  it('an evil executee: no ability, and the Cannibal is poisoned until a good player dies by execution', () => {
    const g = day1(roles);
    execute(g, g.p.poisoner);
    expect(eaten(g, g.p.cannibal)).toEqual({ roleId: null, fromNight: 1, executeeId: g.p.poisoner, fake: true });
    expect(cannibalPoison(g, g.p.cannibal)).toEqual([expect.objectContaining({ type: 'poisoned', sourcePlayerId: g.p.cannibal, expiry: 'until_removed' })]);
    expect(adminView(g.s, g.admin, 0, {}).impairment[g.p.cannibal]).toEqual({ impaired: true, causes: ['poisoned:cannibal'] });
    // Still poisoned through the night and the next day, and after an execution that doesn't kill.
    runNight(nextNightThen(g), {});
    execute(g, g.p.slayer, false);
    expect(cannibalPoison(g, g.p.cannibal)).toHaveLength(1);
    // A good player dies by execution: the poison ends, and the Cannibal has their ability.
    execute(g, g.p.empath);
    expect(cannibalPoison(g, g.p.cannibal)).toEqual([]);
    expect(eaten(g, g.p.cannibal)).toMatchObject({ roleId: 'empath', fake: false });
  });

  it('an execution that doesn\'t kill keeps the ability eaten before', () => {
    const g = day1(roles);
    execute(g, g.p.empath);
    runNight(nextNightThen(g), {});
    execute(g, g.p.sailor, false);
    expect(eaten(g, g.p.cannibal)).toMatchObject({ roleId: 'empath', executeeId: g.p.empath });
  });

  it('a dead Cannibal, or the Cannibal executed, eats nothing', () => {
    const g = day1(roles);
    execute(g, g.p.cannibal);
    expect(eaten(g, g.p.cannibal)).toBeUndefined();
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    expect(eaten(g, g.p.cannibal)).toBeUndefined();
  });

  it('eating the Slayer gives an unused shot, even when the Cannibal\'s Slayer flag was used', () => {
    const g = day1(roles);
    act(g, { type: 'set_flag', playerId: g.p.cannibal, key: 'slayer_used', value: true });
    execute(g, g.p.slayer);
    expect(g.s.flags[g.p.cannibal]?.slayer_used).toBeFalsy();
    expect(abilitiesOf(g.s, g.p.cannibal, Infinity).find((x) => x.roleId === 'slayer')).toMatchObject({ real: true });
  });

  it('an eaten Grandmother or Clockmaker gives its start information the next night', () => {
    for (const info of ['grandmother', 'clockmaker']) {
      const g = day1(['cannibal', 'imp', 'poisoner', info, 'empath', 'sailor']);
      execute(g, g.p[info]);
      expect(startInfoPending(g.s, g.p.cannibal)).toEqual([info]);
      nextNight(g);
      const res = resolve(g);
      expect(resultFor(res, g.p.cannibal, info), info).toMatchObject({ title: 'Cannibal', impaired: false });
      act(g, { type: 'publish_night', force: true });
      expect(startInfoPending(g.s, g.p.cannibal)).toEqual([]);
    }
  });

  it('a Philosopher who chose the Cannibal eats the day after', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'sailor']);
    runNight(g, { [g.p.philosopher]: { philosopher: ['cannibal'] } });
    execute(g, g.p.empath);
    expect(eaten(g, g.p.philosopher)).toMatchObject({ roleId: 'empath', fromNight: 1, fake: false });
    nextNight(g);
    expect(resultFor(resolve(g), g.p.philosopher, 'empath')).toMatchObject({ title: 'Cannibal', impaired: false });
  });

  it('a Drunk or Marionette who thinks they are the Cannibal eats too: they wake as it with false information, never poisoned', () => {
    const g = day1(['drunk', 'marionette', 'imp', 'empath', 'poisoner', 'sailor'], (g) => {
      act(g, { type: 'set_believed_role', playerId: g.p.drunk, roleId: 'cannibal' });
      // Two players can't believe the same role at setup; set the Marionette's directly.
      g.s.assignments[g.p.marionette].believedRoleId = 'cannibal';
    });
    execute(g, g.p.empath);
    for (const pid of [g.p.drunk, g.p.marionette]) {
      expect(eaten(g, pid)).toMatchObject({ roleId: 'empath', fake: false });
      expect(abilitiesOf(g.s, pid, 1).find((x) => x.roleId === 'empath')).toMatchObject({ source: 'cannibal', real: false });
    }
    nextNight(g);
    const res = resolve(g);
    for (const pid of [g.p.drunk, g.p.marionette]) expect(resultFor(res, pid, 'empath')).toMatchObject({ title: 'Cannibal', impaired: true });
    act(g, { type: 'publish_night', force: true });
    execute(g, g.p.poisoner);
    for (const pid of [g.p.drunk, g.p.marionette]) {
      expect(eaten(g, pid)).toMatchObject({ roleId: null, fake: true });
      expect(cannibalPoison(g, pid)).toEqual([]);
    }
  });
});

/** Start the next night and open it, ready for runNight. */
function nextNightThen(g: TestGame): TestGame {
  nextNight(g);
  return g;
}

describe('set_cannibal_ability (Day panel)', () => {
  const roles = ['cannibal', 'imp', 'poisoner', 'empath', 'butler', 'sailor'];

  it('only for a Cannibal (real or believed) who has eaten, during the day, with a character other than the Cannibal', () => {
    const g = day1(roles);
    const set = (playerId: string, roleId: string | null) => tryAct(g, { type: 'set_cannibal_ability', playerId, roleId });
    expect(set(g.p.cannibal, 'empath').ok).toBe(false); // nothing eaten yet
    expect(set(g.p.empath, 'empath').ok).toBe(false); // not a Cannibal
    execute(g, g.p.poisoner);
    expect(set(g.p.cannibal, 'no_such_role').ok).toBe(false);
    expect(set(g.p.cannibal, 'cannibal').ok).toBe(false);
    expect(set(g.p.cannibal, 'empath').ok).toBe(true);
    nextNight(g);
    expect(set(g.p.cannibal, 'sailor').ok).toBe(false); // not at night
  });

  it('after an evil eat, the chosen ability stays not real: the poisoned Cannibal wakes as it with false information', () => {
    const g = day1(roles);
    execute(g, g.p.poisoner);
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'empath' });
    expect(eaten(g, g.p.cannibal)).toEqual({ roleId: 'empath', fromNight: 1, executeeId: g.p.poisoner, fake: true });
    expect(cannibalPoison(g, g.p.cannibal)).toHaveLength(1);
    nextNight(g);
    expect(resultFor(resolve(g), g.p.cannibal, 'empath')).toMatchObject({ title: 'Cannibal', impaired: true });
  });

  it('changes a good eat (e.g. after a re-recorded execution), and null clears it', () => {
    const g = day1(roles);
    execute(g, g.p.empath);
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'sailor' });
    expect(eaten(g, g.p.cannibal)).toMatchObject({ roleId: 'sailor', fake: false });
    expect(abilitiesOf(g.s, g.p.cannibal, 1).find((x) => x.source === 'cannibal')).toMatchObject({ roleId: 'sailor', real: true });
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: null });
    expect(eaten(g, g.p.cannibal)).toMatchObject({ roleId: null, fake: false });
    expect(abilitiesOf(g.s, g.p.cannibal, 1)).toHaveLength(1);
  });
});

describe('Cannibal jinxes', () => {
  const BUTLER = 'Jinx (Cannibal & Butler): You have the Butler ability';

  it('Jinx (Cannibal & Butler): the Cannibal who eats the Butler is told so when the next night starts, once', () => {
    const g = day1(['cannibal', 'imp', 'poisoner', 'empath', 'butler', 'sailor']);
    execute(g, g.p.butler);
    expect(queued(g, g.p.cannibal)).toEqual([BUTLER]);
    expect(titles(g, g.p.cannibal)).not.toContain(BUTLER);
    nextNight(g);
    const notice = g.s.messages[g.p.cannibal].find((m) => m.title === BUTLER)!;
    expect(notice).toMatchObject({ night: 1, kind: 'notice', lines: ['Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.'] });
    // Their Butler picker is named, not hidden.
    expect(actionSpecs(g.s, g.p.cannibal).map((s) => [s.key, s.title])).toEqual([['butler', 'Butler']]);
    runNight(g, { [g.p.cannibal]: { butler: [g.p.empath] } });
    nextNight(g);
    expect(titles(g, g.p.cannibal)).not.toContain(BUTLER);
  });

  it('Jinx (Cannibal & Butler): told when the Storyteller confirms the Butler after an evil eat, and not for other abilities', () => {
    const g = day1(['cannibal', 'imp', 'poisoner', 'empath', 'butler', 'sailor']);
    execute(g, g.p.poisoner);
    expect(queued(g, g.p.cannibal)).toEqual([]);
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'butler' });
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'butler' });
    expect(queued(g, g.p.cannibal)).toEqual([BUTLER]);
    // Changed again before the night: the Butler notice is withdrawn.
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'empath' });
    expect(queued(g, g.p.cannibal)).toEqual([]);
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'butler' });
    nextNight(g);
    expect(titles(g, g.p.cannibal).filter((t) => t === BUTLER)).toHaveLength(1);
  });

  it('Jinx (Cannibal & Zealot): the Cannibal who eats the Zealot is told so when the next night starts', () => {
    const g = day1(['cannibal', 'imp', 'poisoner', 'empath', 'zealot', 'sailor']);
    execute(g, g.p.zealot);
    nextNight(g);
    expect(g.s.messages[g.p.cannibal].find((m) => m.title === 'Jinx (Cannibal & Zealot): You have the Zealot ability'))
      .toMatchObject({ lines: ['If there are 5 or more players alive, you must vote for every nomination.'] });
  });

  it('Jinx (Cannibal & Juggler): the Juggler executed on their first day: that night the living Cannibal learns how many they got right', () => {
    const g = day1(['cannibal', 'imp', 'poisoner', 'juggler', 'empath', 'sailor']);
    act(g, { type: 'set_day_fact', key: 'jugglerCorrect', value: 3 });
    execute(g, g.p.juggler);
    nextNight(g);
    expect(resultFor(resolve(g), g.p.cannibal, 'juggler')).toMatchObject({ title: 'Cannibal', trueLines: ['You guessed 3 correctly.'], impaired: false });
  });

  it('Jinx (Cannibal & Juggler): with no count entered, the Cannibal doesn\'t wake as the Juggler; the real Juggler still does', () => {
    const g = day1(['cannibal', 'imp', 'poisoner', 'juggler', 'empath', 'sailor']);
    execute(g, g.p.juggler);
    nextNight(g);
    expect(wakingRoles(g.s, g.p.cannibal)).toEqual([]);
    expect(resultFor(resolve(g), g.p.cannibal, 'juggler')).toBeUndefined();

    const h = day1(['cannibal', 'imp', 'poisoner', 'juggler', 'empath', 'sailor']);
    nextNight(h);
    expect(wakingRoles(h.s, h.p.juggler)).toEqual(['juggler']);
    expect(resultFor(resolve(h), h.p.juggler, 'juggler')).toBeDefined();
  });

  it('Jinx (Cannibal & Juggler): a Juggler executed on a later day gives the Cannibal nothing (the Storyteller\'s call)', () => {
    const g = day1(['cannibal', 'imp', 'poisoner', 'juggler', 'empath', 'sailor']);
    act(g, { type: 'set_day_fact', key: 'jugglerCorrect', value: 3 });
    runNight(nextNightThen(g), {});
    execute(g, g.p.juggler);
    nextNight(g);
    submit(g, {});
    expect(resultFor(resolve(g), g.p.cannibal, 'juggler')).toBeUndefined();
  });
});

describe('the Cannibal and the Philosopher', () => {
  /** Seats: Philosopher, Cannibal, Imp, Poisoner, Empath, Fortune Teller, Sailor, Butler. */
  const roles = ['philosopher', 'cannibal', 'imp', 'poisoner', 'empath', 'fortune_teller', 'sailor', 'butler'];
  const drunk = (g: TestGame, pid: string) => computeImpairment(g.s, g.s.nightNumber)[pid].impaired;
  const hasFt = (g: TestGame) => abilitiesOf(g.s, g.p.cannibal, Infinity).some((x) => x.roleId === 'fortune_teller');

  /** Day 2: the Philosopher chose the Empath and was executed; the Cannibal ate them and chose the Fortune Teller. */
  function cannibalChoseFt(): TestGame {
    const g = build(roles);
    runNight(g, { [g.p.philosopher]: { philosopher: ['empath'] } });
    expect(drunk(g, g.p.empath)).toBe(true);
    execute(g, g.p.philosopher);
    expect(drunk(g, g.p.empath)).toBe(false);
    nextNight(g);
    expect(actionSpecs(g.s, g.p.cannibal).map((x) => [x.key, x.title])).toEqual([['cannibal', 'Cannibal']]);
    runNight(g, { [g.p.cannibal]: { cannibal: ['fortune_teller'] } });
    expect(g.s.assignments[g.p.cannibal].grantedAbility).toEqual({ roleId: 'fortune_teller', fromNight: 1 });
    expect(drunk(g, g.p.fortune_teller)).toBe(true);
    return g;
  }

  it('what the Cannibal chose as the Philosopher lasts until the next eat, which ends it and the character\'s drunkenness', () => {
    const g = cannibalChoseFt();
    nextNight(g);
    expect(hasFt(g)).toBe(true);
    runNight(g, {});
    nextNight(g);
    runNight(g, {});
    expect(drunk(g, g.p.fortune_teller)).toBe(true);
    execute(g, g.p.sailor);
    expect(eaten(g, g.p.cannibal)).toMatchObject({ roleId: 'sailor' });
    expect(drunk(g, g.p.fortune_teller)).toBe(false);
    expect(hasFt(g)).toBe(false);
    expect(g.s.assignments[g.p.cannibal].grantedAbility).toBeNull();
    nextNight(g);
    expect(actionSpecs(g.s, g.p.cannibal).map((x) => x.roleId)).not.toContain('fortune_teller');
  });

  it('an evil eat ends it too', () => {
    const g = cannibalChoseFt();
    execute(g, g.p.imp);
    expect(hasFt(g)).toBe(false);
    expect(drunk(g, g.p.fortune_teller)).toBe(false);
  });

  it('the Storyteller changing the eaten Philosopher ends it, and its unspent start information', () => {
    const g = build(['philosopher', 'cannibal', 'imp', 'poisoner', 'clockmaker', 'fortune_teller', 'sailor', 'butler']);
    runNight(g, {});
    execute(g, g.p.philosopher);
    nextNight(g);
    runNight(g, { [g.p.cannibal]: { cannibal: ['clockmaker'] } });
    expect(drunk(g, g.p.clockmaker)).toBe(true);
    // Given the night it is chosen, so still marked only if that night passed them by.
    (g.s.roleState[g.p.cannibal] ??= {}).startInfoPending = ['clockmaker'];
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'sailor' });
    expect(g.s.assignments[g.p.cannibal].grantedAbility).toBeNull();
    expect(startInfoPending(g.s, g.p.cannibal)).toEqual([]);
    expect(drunk(g, g.p.clockmaker)).toBe(false);
  });

  it('staying the Philosopher changes nothing', () => {
    const g = cannibalChoseFt();
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'philosopher' });
    expect(hasFt(g)).toBe(true);
    expect(drunk(g, g.p.fortune_teller)).toBe(true);
  });

  it('a Philosopher with the Cannibal\'s ability keeps it when what they ate changes, and the real Cannibal stays drunk', () => {
    const g = build(roles);
    runNight(g, { [g.p.philosopher]: { philosopher: ['cannibal'] } });
    execute(g, g.p.sailor);
    act(g, { type: 'set_cannibal_ability', playerId: g.p.philosopher, roleId: 'philosopher' });
    runNight(nextNightThen(g), {});
    execute(g, g.p.butler);
    expect(g.s.assignments[g.p.philosopher].grantedAbility).toMatchObject({ roleId: 'cannibal' });
    expect(drunk(g, g.p.cannibal)).toBe(true);
  });

  it('a Philosopher who chose the Cannibal and eats the executed real Cannibal gains nothing new', () => {
    const g = build(roles);
    runNight(g, { [g.p.philosopher]: { philosopher: ['cannibal'] } });
    execute(g, g.p.sailor);
    expect(eaten(g, g.p.philosopher)).toMatchObject({ roleId: 'sailor' });
    runNight(nextNightThen(g), {});
    execute(g, g.p.cannibal);
    const roleIds = abilitiesOf(g.s, g.p.philosopher, Infinity).map((x) => x.roleId);
    expect([...new Set(roleIds)]).toEqual(['philosopher', 'cannibal']);
    nextNight(g);
    expect(actionSpecs(g.s, g.p.philosopher)).toEqual([]);
  });
});
