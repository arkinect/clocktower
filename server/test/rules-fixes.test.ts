// The night-engine rules fixes, one describe per fix: each is checked against the official wiki (design.md section 19).
import { describe, expect, it } from 'vitest';
import { ROLE_BY_ID } from '@ct/shared';
import { actionSpecs } from '../src/engine/actions';
import { makeRng } from '../src/engine/rng';
import { enabledRoles, suggestDistribution, targetCounts } from '../src/engine/setup';
import { minionIds, demonIds, typeOf } from '../src/engine/world';
import { computeImpairment } from '../src/engine/impairment';
import { act, alive, build, nextNight, publishAndDay, resolve, resultFor, runNight, submit, tryAct, type TestGame } from './helpers';


describe('Fix 1: Lil\' Monsta setup counts', () => {
  const TOWN = ['empath', 'oracle', 'flowergirl', 'seamstress', 'juggler', 'artist', 'gambler', 'virgin', 'slayer'];
  const MINIONS = ['assassin', 'witch', 'mezepheles'];
  const lilMonstaGame = (n: number, minions: number): TestGame => build([
    'lil_monsta', ...MINIONS.slice(0, minions), ...TOWN.slice(0, n - 1 - minions),
  ]);

  it.each([[7, [5, 0, 1, 1], 1, 2], [10, [7, 0, 2, 1], 2, 3], [13, [9, 0, 3, 1], 3, 4]] as const)(
    'at %i players the chart is used unchanged, and the Lil\' Monsta player is the extra Minion', (n, chart, dealt, minions) => {
      const g = lilMonstaGame(n, dealt);
      expect(targetCounts(g.s, n, ['lil_monsta']).counts).toEqual(chart);
      resolve(g);
      publishAndDay(g);
      expect(minionIds(g.s)).toHaveLength(minions);
      expect(g.s.players.filter((p) => !p.isAdmin).some((p) => typeOf(g.s, p.id) === 'demon')).toBe(false);
      expect(demonIds(g.s)).toHaveLength(1); // the token holder, who has no Demon role
    });

  it('a suggested distribution with Lil\' Monsta follows the chart', () => {
    const g = lilMonstaGame(7, 1);
    const others = ['imp', 'pukka', 'shabaloth', 'po', 'no_dashii', 'vigormortis', 'al_hadikhia', 'baron', 'godfather', 'balloonist'];
    g.s.script = enabledRoles(g.s).filter((r) => !others.includes(r));
    const sug = suggestDistribution(g.s, makeRng(7)) as Record<string, string>;
    const types = Object.values(sug).map((r) => ROLE_BY_ID[r].type);
    expect(Object.values(sug)).toContain('lil_monsta');
    expect(['townsfolk', 'outsider', 'minion', 'demon'].map((x) => types.filter((y) => y === x).length)).toEqual([5, 0, 1, 1]);
  });
});

/** Whether a player is impaired as the world stands (the last night's impairment). */
const impaired = (g: TestGame, pid: string) => !!computeImpairment(g.s, Math.max(0, g.s.nightNumber))[pid]?.impaired;

describe('Fix 2: Philosopher', () => {
  const ROLES = ['philosopher', 'imp', 'poisoner', 'butler', 'virgin'];

  it('a Philosopher who chooses the Empath gets a result that night, on night 0 and on night 2', () => {
    let g = build(ROLES);
    expect(resultFor(runNight(g, { [g.p.philosopher]: { philosopher: ['empath'] } }).final, g.p.philosopher, 'empath')).toBeDefined();
    g = build(ROLES);
    runNight(g, { [g.p.philosopher]: { philosopher: 'decline' } });
    nextNight(g);
    runNight(g, { [g.p.philosopher]: { philosopher: 'decline' } });
    nextNight(g);
    expect(resultFor(runNight(g, { [g.p.philosopher]: { philosopher: ['empath'] } }).final, g.p.philosopher, 'empath')).toBeDefined();
  });

  it('a gained ability with input is a follow-up question: publishing waits, and the answer resolves at its slot', () => {
    const g = build(ROLES);
    submit(g, { [g.p.philosopher]: { philosopher: ['fortune_teller'] } });
    let res = resolve(g);
    const key = `late:${g.p.philosopher}:fortune_teller`;
    expect(res.followUps).toMatchObject([{ key, playerId: g.p.philosopher, roleId: 'fortune_teller', answered: false }]);
    expect(res.actors.find((r) => r.roleId === 'fortune_teller')!.outcome).toMatch(/^waiting/);
    expect(resultFor(res, g.p.philosopher, 'fortune_teller')).toBeUndefined();
    expect(tryAct(g, { type: 'publish_night' })).toMatchObject({ ok: false });
    act(g, { type: 'answer_follow_up', key, choice: { values: [g.p.imp, g.p.butler] } }, g.p.philosopher);
    res = g.s.night!.resolution!;
    expect(resultFor(res, g.p.philosopher, 'fortune_teller')!.finalLines[0]).toMatch(/Yes/);
    act(g, { type: 'publish_night' });
    expect(g.s.phase).toBe('DAY');
  });

  it('the Storyteller can answer the Sailor\'s question, and it takes effect at the Sailor\'s slot', () => {
    const g = build(ROLES);
    submit(g, { [g.p.philosopher]: { philosopher: ['sailor'] } });
    resolve(g);
    const key = `late:${g.p.philosopher}:sailor`;
    expect(g.s.night!.resolution!.followUps.map((f) => f.key)).toEqual([key]);
    act(g, { type: 'answer_follow_up_for', key, choice: { values: [g.p.butler] } });
    const res = resolve(g, { [`sailor:${g.p.philosopher}`]: g.p.butler });
    expect(res.after.effects.some((e) => e.cause === 'sailor' && e.targetPlayerId === g.p.butler)).toBe(true);
  });

  it('a gained passive works that night', () => {
    const g = build(ROLES);
    runNight(g, { [g.p.philosopher]: { philosopher: 'decline' } });
    nextNight(g);
    submit(g, { [g.p.philosopher]: { philosopher: ['sailor'] }, [g.p.imp]: { imp: [g.p.philosopher] } });
    expect(resolve(g).deaths).toEqual([]);
  });

  it('the choice drunks the in-play holder before the holder\'s own slot', () => {
    const g = build(['philosopher', 'empath', 'imp', 'poisoner', 'butler']);
    const { final } = runNight(g, { [g.p.philosopher]: { philosopher: ['empath'] } });
    expect(resultFor(final, g.p.empath)).toMatchObject({ impaired: true, causes: ['drunk:philosopher'] });
  });

  it('a Philosopher-Clockmaker learns the distance that night, once; a real Clockmaker wakes on night 0 only', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'clockmaker', 'butler']);
    expect(resultFor(runNight(g, { [g.p.philosopher]: { philosopher: 'decline' } }).final, g.p.clockmaker, 'clockmaker')).toBeDefined();
    nextNight(g);
    const { final } = runNight(g, { [g.p.philosopher]: { philosopher: ['clockmaker'] } });
    expect(resultFor(final, g.p.philosopher, 'clockmaker')).toBeDefined();
    expect(resultFor(final, g.p.clockmaker, 'clockmaker')).toBeUndefined();
    nextNight(g);
    expect(resultFor(resolve(g), g.p.philosopher, 'clockmaker')).toBeUndefined();
  });

  it('the Damsel turned Grandmother gets the information and no link that night', () => {
    const g = build(['huntsman', 'damsel', 'imp', 'poisoner', 'butler']);
    const { final } = runNight(g, { [g.p.huntsman]: { huntsman: [g.p.damsel] } }, { [`huntsman:${g.p.huntsman}`]: 'grandmother' });
    expect(resultFor(final, g.p.damsel, 'grandmother')).toBeDefined();
    expect(final.reviewItems.some((i) => i.kind === 'grandmother_link')).toBe(false);
  });

  describe('the held character\'s drunkenness', () => {
    function heldEmpath() {
      const g = build(['philosopher', 'empath', 'imp', 'poisoner', 'butler']);
      runNight(g, { [g.p.philosopher]: { philosopher: ['empath'] } });
      expect(impaired(g, g.p.empath)).toBe(true);
      return g;
    }

    it('pauses while the Philosopher is poisoned, and comes back once they are sober', () => {
      const g = heldEmpath();
      nextNight(g);
      const { final } = runNight(g, { [g.p.poisoner]: { poisoner: [g.p.philosopher] } });
      expect(resultFor(final, g.p.empath)!.impaired).toBe(false);
      expect(impaired(g, g.p.empath)).toBe(false);
      nextNight(g);
      expect(impaired(g, g.p.empath)).toBe(true);
    });

    it('pauses while the Philosopher is drunk', () => {
      const g = heldEmpath();
      act(g, { type: 'add_effect', targetId: g.p.philosopher, effectType: 'drunk' });
      expect(impaired(g, g.p.empath)).toBe(false);
    });

    it('ends for good once the Philosopher dies', () => {
      const g = heldEmpath();
      act(g, { type: 'mark_alive', playerId: g.p.philosopher, alive: false });
      expect(impaired(g, g.p.empath)).toBe(false);
      nextNight(g);
      expect(impaired(g, g.p.empath)).toBe(false);
    });
  });
});

describe('Fix 3: players revived at night act later that night only with no input', () => {
  /** A game on night 1: `victim` died during day 1, and the Professor is about to choose them. */
  function professorRevives(victim: string, others: string[] = []): TestGame {
    const g = build(['professor', victim, 'imp', 'poisoner', 'butler', ...others]);
    runNight(g, {});
    act(g, { type: 'mark_alive', playerId: g.p[victim], alive: false });
    nextNight(g);
    submit(g, { [g.p.professor]: { professor: [g.p[victim]] } });
    return g;
  }

  it('the Professor revives an Empath, who gets a result that night', () => {
    const g = professorRevives('empath');
    const res = resolve(g);
    expect(res.revived).toEqual([g.p.empath]);
    expect(res.followUps).toEqual([]);
    expect(resultFor(res, g.p.empath, 'empath')).toBeDefined();
  });

  it('the Professor revives a Fortune Teller: no question tonight, publishing doesn\'t wait, and they act the next night', () => {
    const g = professorRevives('fortune_teller');
    const res = resolve(g);
    expect(res.revived).toEqual([g.p.fortune_teller]);
    expect(res.followUps).toEqual([]);
    expect(res.actors.some((r) => r.playerId === g.p.fortune_teller)).toBe(false);
    act(g, { type: 'publish_night' });
    nextNight(g);
    submit(g, { [g.p.fortune_teller]: { fortune_teller: [g.p.imp, g.p.butler] } });
    expect(resultFor(resolve(g), g.p.fortune_teller, 'fortune_teller')!.finalLines[0]).toMatch(/Yes/);
  });

  it('the Professor revives a Sailor, whose slot has passed: no Sailor action that night', () => {
    const g = professorRevives('sailor');
    const res = resolve(g);
    expect(res.revived).toEqual([g.p.sailor]);
    expect(res.followUps).toEqual([]);
    expect(res.actors.some((r) => r.playerId === g.p.sailor)).toBe(false);
  });

  it('the Shabaloth regurgitates a Fortune Teller, who is asked nothing that night', () => {
    const g = build(['shabaloth', 'fortune_teller', 'poisoner', 'butler', 'virgin', 'empath', 'flowergirl']);
    runNight(g, {});
    nextNight(g);
    runNight(g, { [g.p.shabaloth]: { shabaloth: [g.p.fortune_teller, g.p.virgin] } });
    nextNight(g);
    submit(g, { [g.p.shabaloth]: { shabaloth: [g.p.butler, g.p.empath] } });
    const res = resolve(g, { [`shabaloth:${g.p.shabaloth}`]: g.p.fortune_teller });
    expect(res.revived).toEqual([g.p.fortune_teller]);
    expect(res.followUps).toEqual([]);
  });

  /** A Philosopher who chose the Fortune Teller tonight: their single follow-up is open. */
  function philosopherFortuneTeller(others: string[] = []): TestGame {
    const g = build(['philosopher', 'imp', 'poisoner', 'butler', 'virgin', ...others]);
    submit(g, { [g.p.philosopher]: { philosopher: ['fortune_teller'] } });
    resolve(g);
    return g;
  }

  it('a Goon chosen by a Philosopher\'s late choice triggers as normal', () => {
    const g = philosopherFortuneTeller(['goon']);
    act(g, { type: 'answer_follow_up_for', key: `late:${g.p.philosopher}:fortune_teller`, choice: { values: [g.p.goon, g.p.butler] } });
    const res = g.s.night!.resolution!;
    expect(res.after.effects.some((e) => e.cause === 'goon' && e.targetPlayerId === g.p.philosopher)).toBe(true);
    expect(resultFor(res, g.p.philosopher, 'fortune_teller')!.impaired).toBe(true);
  });

  it('the Huntsman\'s Damsel still doesn\'t act that night', () => {
    const g = build(['huntsman', 'damsel', 'imp', 'poisoner', 'butler']);
    const { final } = runNight(g, { [g.p.huntsman]: { huntsman: [g.p.damsel] } }, { [`huntsman:${g.p.huntsman}`]: 'empath' });
    expect(final.followUps).toEqual([]);
    expect(resultFor(final, g.p.damsel, 'empath')).toBeUndefined();
  });

  it('a Philosopher who chooses the Professor is offered only players dead when the night began and still dead', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'butler', 'virgin', 'empath', 'flowergirl']);
    runNight(g, { [g.p.philosopher]: { philosopher: 'decline' } });
    act(g, { type: 'mark_alive', playerId: g.p.virgin, alive: false });
    nextNight(g);
    submit(g, { [g.p.philosopher]: { philosopher: ['professor'] }, [g.p.imp]: { imp: [g.p.empath] } });
    const [q] = resolve(g).followUps;
    expect(q.key).toBe(`late:${g.p.philosopher}:professor`);
    expect(q.spec.fields[0].options).toEqual([g.p.virgin]);
  });

  it('reopening collecting clears the late answers', () => {
    const g = philosopherFortuneTeller();
    const key = `late:${g.p.philosopher}:fortune_teller`;
    act(g, { type: 'answer_follow_up_for', key, choice: { values: [g.p.imp, g.p.butler] } });
    act(g, { type: 'reopen_collecting' });
    expect(g.s.night!.followUpAnswers).toEqual({});
    expect(resolve(g).followUps).toMatchObject([{ key, answered: false }]);
  });
});

describe('Fix 5: a Gossip killed before their slot kills nobody', () => {
  function trueStatement() {
    const g = build(['gossip', 'imp', 'poisoner', 'empath', 'butler', 'virgin', 'flowergirl']);
    runNight(g, {});
    act(g, { type: 'set_day_fact', key: 'gossipStatement', value: 'true' });
    nextNight(g);
    return g;
  }

  it('the Demon kills the Gossip that night: no Gossip kill and no review item', () => {
    const g = trueStatement();
    submit(g, { [g.p.imp]: { imp: [g.p.gossip] } });
    const res = resolve(g);
    expect(res.deaths).toEqual([g.p.gossip]);
    expect(res.reviewItems.some((i) => i.kind === 'gossip_victim')).toBe(false);
  });

  it('the Gossip alive at their slot kills as before', () => {
    const g = trueStatement();
    submit(g, { [g.p.imp]: { imp: [g.p.empath] } });
    const item = resolve(g).reviewItems.find((i) => i.kind === 'gossip_victim')!;
    expect(resolve(g, { [item.key]: g.p.butler }).deaths).toEqual([g.p.empath, g.p.butler]);
  });
});

describe('Fix 7: Mathematician', () => {
  const count = (g: TestGame) => Number(resultFor(g.s.night!.resolution!, g.p.mathematician)!.trueLines[0].split(' ')[0]);
  const shoot = (g: TestGame, targetId: string, mode: 'preview' | 'accept', recluseAs?: 'demon') =>
    act(g, { type: 'day_kill', kind: 'slayer', sourceId: g.p.slayer, targetId, mode, recluseAs });

  describe('since dawn', () => {
    function poisonedSlayer() {
      const g = build(['mathematician', 'slayer', 'poisoner', 'imp', 'butler', 'empath']);
      runNight(g, { [g.p.poisoner]: { poisoner: [g.p.slayer] } });
      return g;
    }

    it('a Slayer poisoned by the Poisoner who shoots by day is counted that night', () => {
      const g = poisonedSlayer();
      shoot(g, g.p.imp, 'accept');
      expect(g.s.days[1].abnormal).toMatchObject([{ playerId: g.p.slayer, detail: 'Slayer ability impaired' }]);
      nextNight(g);
      resolve(g);
      expect(count(g)).toBe(1);
    });

    it('a shot that is only previewed, then cancelled, is not counted', () => {
      const g = poisonedSlayer();
      shoot(g, g.p.imp, 'preview');
      expect(g.s.days[1].abnormal).toBeUndefined();
      nextNight(g);
      resolve(g);
      expect(count(g)).toBe(0);
    });

    it('a Tea Lady poisoned by the Poisoner who fails to protect against a Slayer shot is counted', () => {
      const g = build(['mathematician', 'tea_lady', 'recluse', 'slayer', 'poisoner', 'imp', 'butler']);
      runNight(g, { [g.p.poisoner]: { poisoner: [g.p.tea_lady] } });
      shoot(g, g.p.recluse, 'accept', 'demon');
      expect(alive(g, g.p.recluse)).toBe(false);
      expect(g.s.days[1].abnormal!.map((e) => e.playerId)).toEqual([g.p.slayer, g.p.tea_lady]);
      nextNight(g);
      resolve(g);
      expect(count(g)).toBe(2);
    });

    it('a day event counts for that night only', () => {
      const g = poisonedSlayer();
      shoot(g, g.p.imp, 'accept');
      nextNight(g);
      resolve(g);
      publishAndDay(g);
      nextNight(g);
      resolve(g);
      expect(count(g)).toBe(0);
    });
  });

  describe('Recluse', () => {
    it('misleading the Empath and the Fortune Teller in one night counts 2, and not the Recluse', () => {
      const g = build(['empath', 'recluse', 'fortune_teller', 'mathematician', 'imp', 'poisoner', 'butler']);
      submit(g, { [g.p.fortune_teller]: { fortune_teller: [g.p.recluse, g.p.butler] } });
      const res = resolve(g, {
        [`reg:empath:${g.p.empath}:${g.p.recluse}`]: 'minion',
        [`reg:fortune_teller:${g.p.fortune_teller}:${g.p.recluse}`]: 'demon',
      });
      expect(count(g)).toBe(2);
      expect(res.abnormal.map((e) => e.playerId).sort()).toEqual([g.p.empath, g.p.fortune_teller].sort());
    });

    it('the Godfather\'s hidden Recluse counts the Godfather on night 0', () => {
      const g = build(['godfather', 'recluse', 'mathematician', 'imp', 'empath', 'butler'], (x) => { act(x, { type: 'set_godfather_outsiders', value: 1 }); });
      const res = resolve(g, { [`godfather_recluse:${g.p.godfather}:${g.p.recluse}`]: 'hide' });
      expect(count(g)).toBe(1);
      expect(res.abnormal.map((e) => e.playerId)).toEqual([g.p.godfather]);
    });
  });
  type Believer = 'drunk' | 'marionette';
  const believing = (role: Believer, believed: string) => build(['mathematician', role, 'imp', 'poisoner', 'butler', 'virgin'], (g) => {
    act(g, { type: 'set_believed_role', playerId: g.p[role], roleId: believed });
  });

  /** A believed Empath: false info counts, the truth sent doesn't. */
  function falseInfoCounts(role: Believer, name: string) {
    const g = believing(role, 'empath');
    const res = resolve(g);
    expect(count(g)).toBe(1);
    expect(res.abnormal).toMatchObject([{ playerId: g.p[role], detail: `${name}'s ability yielded false info` }]);
    const row = resultFor(res, g.p[role], 'empath')!;
    act(g, { type: 'override_result', key: row.key, lines: row.trueLines });
    expect(count(g)).toBe(0);
  }

  /** A believed Sailor's choice failed to work: counted, and the Storyteller can remove it. */
  function failedChoiceCounts(role: Believer, name: string) {
    const g = believing(role, 'sailor');
    submit(g, { [g.p[role]]: { sailor: [g.p.butler] } });
    const res = resolve(g);
    expect(count(g)).toBe(1);
    expect(res.abnormal).toMatchObject([{ playerId: g.p[role], detail: `${name}'s ability failed` }]);
    act(g, { type: 'math_adjust', add: [], remove: [g.p[role]] });
    expect(count(g)).toBe(0);
  }

  function declineNotCounted(role: Believer) {
    const g = believing(role, 'seamstress');
    submit(g, { [g.p[role]]: { seamstress: 'decline' } });
    resolve(g);
    expect(count(g)).toBe(0);
  }

  /** The false-value cap includes them only when the believed role has a night ability. */
  function capIncludes(role: Believer) {
    const alternatives = (believed: string) => {
      const g = believing(role, believed);
      submit(g, { [g.p.poisoner]: { poisoner: [g.p.mathematician] } });
      return resultFor(resolve(g), g.p.mathematician)!.alternatives.length;
    };
    expect(alternatives('empath')).toBe(alternatives('mayor') + 1);
  }

  it('Jinx (Mathematician & Drunk): false info is counted, unless the truth is sent', () => falseInfoCounts('drunk', 'Drunk'));
  it('Jinx (Mathematician & Drunk): a Drunk-Sailor\'s choice is counted', () => failedChoiceCounts('drunk', 'Drunk'));
  it('Jinx (Mathematician & Drunk): a declined choice is not counted', () => declineNotCounted('drunk'));
  it('Jinx (Mathematician & Drunk): the false-value cap includes the Drunk', () => capIncludes('drunk'));
  it('Jinx (Mathematician & Marionette): false info is counted, unless the truth is sent', () => falseInfoCounts('marionette', 'Marionette'));
  it('Jinx (Mathematician & Marionette): a believed Sailor\'s choice is counted', () => failedChoiceCounts('marionette', 'Marionette'));
  it('Jinx (Mathematician & Marionette): a declined choice is not counted', () => declineNotCounted('marionette'));
  it('Jinx (Mathematician & Marionette): the false-value cap includes the Marionette', () => capIncludes('marionette'));
});

describe('Fix 8: alive-only pickers for the Sailor, Devil\'s Advocate and Huntsman', () => {
  it.each(['sailor', 'devils_advocate', 'huntsman'])('%s: a player dead at the start of the night isn\'t offered, and is refused', (role) => {
    const g = build([role, 'imp', 'poisoner', 'empath', 'butler', 'damsel', 'virgin']);
    runNight(g, {});
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    nextNight(g);
    const spec = actionSpecs(g.s, g.p[role]).find((x) => x.key === role)!;
    expect(spec.fields[0].options).not.toContain(g.p.empath);
    expect(spec.fields[0].options).toContain(g.p.butler);
    const actions = { [role]: { values: [g.p.empath] } };
    expect(tryAct(g, { type: 'submit_night', actions }, g.p[role])).toMatchObject({ ok: false });
    expect(tryAct(g, { type: 'submit_for', playerId: g.p[role], actions })).toMatchObject({ ok: false });
  });

  it('the Sailor may still choose themselves', () => {
    const g = build(['sailor', 'imp', 'poisoner', 'empath', 'butler']);
    expect(actionSpecs(g.s, g.p.sailor)[0].fields[0].options).toContain(g.p.sailor);
  });

  it('the Devil\'s Advocate still can\'t repeat last night\'s choice', () => {
    const g = build(['devils_advocate', 'imp', 'poisoner', 'empath', 'butler']);
    runNight(g, { [g.p.devils_advocate]: { devils_advocate: [g.p.butler] } });
    nextNight(g);
    expect(actionSpecs(g.s, g.p.devils_advocate)[0].fields[0].options).not.toContain(g.p.butler);
  });
});

describe('Fix 9: the Gambler may choose themselves', () => {
  function gamblerNight1(role: 'gambler' | 'drunk') {
    const g = build([role, 'imp', 'poisoner', 'empath', 'butler'], (x) => {
      if (role === 'drunk') act(x, { type: 'set_believed_role', playerId: x.p.drunk, roleId: 'gambler' });
    });
    runNight(g, {});
    nextNight(g);
    return g;
  }

  it('the Gambler\'s options include themselves', () => {
    const g = gamblerNight1('gambler');
    expect(actionSpecs(g.s, g.p.gambler)[0].fields[0].options).toContain(g.p.gambler);
  });

  it('guessing your own role right does nothing', () => {
    const g = gamblerNight1('gambler');
    submit(g, { [g.p.gambler]: { gambler: [g.p.gambler, 'gambler'] } });
    expect(resolve(g).deaths).toEqual([]);
  });

  it('a Drunk who believes they are the Gambler guesses Gambler: wrong, and the impaired path means no death', () => {
    const g = gamblerNight1('drunk');
    submit(g, { [g.p.drunk]: { gambler: [g.p.drunk, 'gambler'] } });
    const res = resolve(g);
    expect(res.deaths).toEqual([]);
    expect(res.actors.find((r) => r.playerId === g.p.drunk)!.outcome).toContain('impaired: does not die');
  });
});

describe('Fix 10: a starpass must pick a living Minion', () => {
  function starpass(roles: string[]) {
    const g = build(roles);
    runNight(g, {});
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.imp] } });
    return g;
  }
  const ROLES = ['imp', 'poisoner', 'assassin', 'empath', 'butler', 'virgin', 'oracle'];

  it('the review\'s options are exactly the living Minions', () => {
    const g = starpass(ROLES);
    const item = resolve(g).reviewItems.find((i) => i.kind === 'starpass')!;
    expect(item.options.map((o) => o.id).sort()).toEqual([g.p.poisoner, g.p.assassin].sort());
  });

  it('a stored choice of none falls back to the default Minion, who becomes the Imp', () => {
    const g = starpass(ROLES);
    const key = `starpass:${g.p.imp}`;
    const res = resolve(g, { [key]: 'none' });
    const item = res.reviewItems.find((i) => i.kind === 'starpass')!;
    expect(item.chosen).toBeNull();
    expect(res.after.assignments[item.default].roleId).toBe('imp');
  });

  it('with no living Minion nobody becomes the Imp, and the actor row says so', () => {
    const g = build(['imp', 'poisoner', 'empath', 'butler', 'virgin']);
    runNight(g, {});
    act(g, { type: 'mark_alive', playerId: g.p.poisoner, alive: false });
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.imp] } });
    const res = resolve(g);
    expect(res.reviewItems.some((i) => i.kind === 'starpass')).toBe(false);
    expect(res.actors.find((r) => r.playerId === g.p.imp)!.outcome).toContain('starpass: no living Minion');
    expect(Object.values(res.after.assignments).filter((a) => a.roleId === 'imp')).toHaveLength(1); // the dead Imp
  });
});
