// The night-engine rules fixes, one describe per fix: each is checked against the official wiki (design.md section 19).
import { describe, expect, it } from 'vitest';
import { ROLE_BY_ID } from '@ct/shared';
import { makeRng } from '../src/engine/rng';
import { enabledRoles, suggestDistribution, targetCounts } from '../src/engine/setup';
import { minionIds, demonIds, typeOf } from '../src/engine/world';
import { computeImpairment } from '../src/engine/impairment';
import { act, build, nextNight, publishAndDay, resolve, resultFor, runNight, submit, tryAct, type TestGame } from './helpers';


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

describe('Fix 3: players revived at night act later that night', () => {
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

  it('the Professor revives a Fortune Teller: asked as a follow-up, and publishing waits for the answer', () => {
    const g = professorRevives('fortune_teller');
    const key = `late:${g.p.fortune_teller}:fortune_teller`;
    const res = resolve(g);
    expect(res.followUps).toMatchObject([{ key, playerId: g.p.fortune_teller, answered: false }]);
    expect(res.followUps[0].spec.prompt).toMatch(/^You have been brought back to life\. /);
    expect(tryAct(g, { type: 'publish_night' })).toMatchObject({ ok: false });
    act(g, { type: 'answer_follow_up', key, choice: { values: [g.p.imp, g.p.butler] } }, g.p.fortune_teller);
    expect(resultFor(g.s.night!.resolution!, g.p.fortune_teller, 'fortune_teller')!.finalLines[0]).toMatch(/Yes/);
    act(g, { type: 'publish_night' });
    expect(g.s.phase).toBe('DAY');
  });

  it('the Storyteller can answer a revived player\'s question', () => {
    const g = professorRevives('fortune_teller');
    resolve(g);
    act(g, { type: 'answer_follow_up_for', key: `late:${g.p.fortune_teller}:fortune_teller`, choice: { values: [g.p.imp, g.p.butler] } });
    expect(resultFor(g.s.night!.resolution!, g.p.fortune_teller, 'fortune_teller')).toBeDefined();
  });

  it('the Professor revives a Sailor, whose slot has passed: no Sailor action that night', () => {
    const g = professorRevives('sailor');
    const res = resolve(g);
    expect(res.revived).toEqual([g.p.sailor]);
    expect(res.followUps).toEqual([]);
    expect(res.actors.some((r) => r.playerId === g.p.sailor)).toBe(false);
  });

  it('the Shabaloth regurgitates a Fortune Teller, who is asked and acts that night', () => {
    const g = build(['shabaloth', 'fortune_teller', 'poisoner', 'butler', 'virgin', 'empath', 'flowergirl']);
    runNight(g, {});
    nextNight(g);
    runNight(g, { [g.p.shabaloth]: { shabaloth: [g.p.fortune_teller, g.p.virgin] } });
    nextNight(g);
    submit(g, { [g.p.shabaloth]: { shabaloth: [g.p.butler, g.p.empath] } });
    resolve(g, { [`shabaloth:${g.p.shabaloth}`]: g.p.fortune_teller });
    const key = `late:${g.p.fortune_teller}:fortune_teller`;
    expect(g.s.night!.resolution!.followUps.map((f) => f.key)).toEqual([key]);
    act(g, { type: 'answer_follow_up_for', key, choice: { values: [g.p.shabaloth, g.p.poisoner] } });
    expect(resultFor(g.s.night!.resolution!, g.p.fortune_teller, 'fortune_teller')!.finalLines[0]).toMatch(/Yes/);
  });

  it('a Goon chosen by a revived player\'s late choice triggers as normal', () => {
    const g = professorRevives('fortune_teller', ['goon']);
    resolve(g);
    act(g, { type: 'answer_follow_up_for', key: `late:${g.p.fortune_teller}:fortune_teller`, choice: { values: [g.p.goon, g.p.butler] } });
    const res = g.s.night!.resolution!;
    expect(res.after.effects.some((e) => e.cause === 'goon' && e.targetPlayerId === g.p.fortune_teller)).toBe(true);
    expect(resultFor(res, g.p.fortune_teller, 'fortune_teller')!.impaired).toBe(true);
  });

  it('the Huntsman\'s Damsel still doesn\'t act that night', () => {
    const g = build(['huntsman', 'damsel', 'imp', 'poisoner', 'butler']);
    const { final } = runNight(g, { [g.p.huntsman]: { huntsman: [g.p.damsel] } }, { [`huntsman:${g.p.huntsman}`]: 'empath' });
    expect(final.followUps).toEqual([]);
    expect(resultFor(final, g.p.damsel, 'empath')).toBeUndefined();
  });

  it('a revived Professor is offered only players dead now who were dead when the night began', () => {
    const g = build(['shabaloth', 'professor', 'poisoner', 'butler', 'virgin', 'empath', 'flowergirl']);
    runNight(g, {});
    nextNight(g);
    runNight(g, { [g.p.shabaloth]: { shabaloth: [g.p.professor, g.p.virgin] } });
    nextNight(g);
    submit(g, { [g.p.shabaloth]: { shabaloth: [g.p.butler, g.p.empath] } });
    resolve(g, { [`shabaloth:${g.p.shabaloth}`]: g.p.professor });
    const [q] = g.s.night!.resolution!.followUps;
    expect(q.key).toBe(`late:${g.p.professor}:professor`);
    expect(q.spec.fields[0].options).toEqual([g.p.virgin]);
  });

  it('reopening collecting clears the late answers', () => {
    const g = professorRevives('fortune_teller');
    resolve(g);
    const key = `late:${g.p.fortune_teller}:fortune_teller`;
    act(g, { type: 'answer_follow_up_for', key, choice: { values: [g.p.imp, g.p.butler] } });
    act(g, { type: 'reopen_collecting' });
    expect(g.s.night!.followUpAnswers).toEqual({});
    expect(resolve(g).followUps).toMatchObject([{ key, answered: false }]);
  });
});
