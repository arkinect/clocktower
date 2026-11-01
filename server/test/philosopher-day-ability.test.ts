// A Philosopher gains the ability during the night they choose it, so a gained day ability (the Slayer's shot) works
// on the day right after (design.md 14.4, Philosopher).
import { describe, expect, it } from 'vitest';
import { act, alive, build, runNight, tryAct } from './helpers';

const shoot = (sourceId: string, targetId: string, mode: 'preview' | 'accept') => ({ type: 'day_kill' as const, kind: 'slayer' as const, sourceId, targetId, mode });

function philosopherChoosesSlayer(roles = ['philosopher', 'imp', 'poisoner', 'empath', 'butler', 'sailor']) {
  const g = build(roles);
  runNight(g, { [g.p.butler]: { butler: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.poisoner]: { poisoner: [g.p.empath] } });
  // Day 1: no ability yet.
  expect(tryAct(g, shoot(g.p.philosopher, g.p.imp, 'preview'))).toMatchObject({ ok: false, error: 'That player is not the Slayer.' });
  act(g, { type: 'start_night' });
  runNight(g, {
    [g.p.philosopher]: { philosopher: ['slayer'] }, [g.p.butler]: { butler: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] },
    [g.p.poisoner]: { poisoner: [g.p.empath] }, [g.p.imp]: { imp: [g.p.empath] },
  });
  return g;
}

describe('Philosopher: a gained day ability', () => {
  it('the Slayer shot works on the day right after the choosing night', () => {
    const g = philosopherChoosesSlayer();
    expect(g.s.assignments[g.p.philosopher].grantedAbility).toEqual({ roleId: 'slayer', fromNight: 2 });
    expect(g.s.nightNumber).toBe(1);
    const pre = act(g, shoot(g.p.philosopher, g.p.imp, 'preview'));
    expect(pre.data).toMatchObject({ wouldDie: true });
    act(g, shoot(g.p.philosopher, g.p.imp, 'accept'));
    expect(alive(g, g.p.imp)).toBe(false);
    expect(g.s.flags[g.p.philosopher].slayer_used).toBe(true);
    expect(tryAct(g, shoot(g.p.philosopher, g.p.imp, 'preview'))).toMatchObject({ ok: false, error: 'The Slayer has already used their shot.' });
  });

  it('the real Slayer is drunk that day, and their shot does nothing', () => {
    const g = philosopherChoosesSlayer(['philosopher', 'imp', 'poisoner', 'empath', 'butler', 'sailor', 'slayer']);
    const pre = act(g, shoot(g.p.slayer, g.p.imp, 'preview'));
    expect(pre.data).toMatchObject({ wouldDie: false, reason: 'The Slayer is drunk or poisoned: nothing happens.' });
    expect(act(g, shoot(g.p.philosopher, g.p.imp, 'preview')).data).toMatchObject({ wouldDie: true });
  });

  it('a Philosopher who chose another ability is still not the Slayer', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler', 'sailor']);
    runNight(g, {
      [g.p.philosopher]: { philosopher: ['empath'] }, [g.p.butler]: { butler: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] },
      [g.p.poisoner]: { poisoner: [g.p.empath] },
    });
    expect(tryAct(g, shoot(g.p.philosopher, g.p.imp, 'preview'))).toMatchObject({ ok: false, error: 'That player is not the Slayer.' });
  });

  // Night 0: the Philosopher chooses `gained` and the Witch curses `cursed`; returns the game on day 1.
  function cursedAfterChoosing(roles: string[], gained: string, cursed: (g: ReturnType<typeof build>) => string) {
    const g = build(roles);
    runNight(g, { [g.p.philosopher]: { philosopher: [gained] }, [g.p.witch]: { witch: [cursed(g)] } });
    expect(g.s.assignments[g.p.philosopher].grantedAbility).toEqual({ roleId: gained, fromNight: 1 });
    return g;
  }
  const curse = (targetId: string, mode: 'preview' | 'accept') => ({ type: 'day_kill' as const, kind: 'witch' as const, targetId, sourceId: targetId, mode });

  it('a Philosopher who chose the Sailor survives the Witch\'s curse the day after choosing', () => {
    const g = cursedAfterChoosing(['philosopher', 'imp', 'witch', 'empath', 'clockmaker', 'mayor'], 'sailor', (g) => g.p.philosopher);
    expect(act(g, curse(g.p.philosopher, 'preview')).data).toMatchObject({ wouldDie: false, reason: expect.stringMatching(/sober Sailor/) });
    act(g, curse(g.p.philosopher, 'accept'));
    expect(alive(g, g.p.philosopher)).toBe(true);
  });

  it('a Philosopher who chose the Fool survives the Witch\'s curse the day after, using the Fool', () => {
    const g = cursedAfterChoosing(['philosopher', 'imp', 'witch', 'empath', 'clockmaker', 'mayor'], 'fool', (g) => g.p.philosopher);
    expect(act(g, curse(g.p.philosopher, 'preview')).data).toMatchObject({ wouldDie: false, usesFool: true });
    act(g, curse(g.p.philosopher, 'accept'));
    expect(alive(g, g.p.philosopher)).toBe(true);
    expect(g.s.flags[g.p.philosopher].fool_used).toBe(true);
  });

  it('a Philosopher who chose the Tea Lady protects a good neighbour from the curse the day after', () => {
    // Seats: philosopher, empath, imp, witch, clockmaker, mayor; the Philosopher's alive neighbours are the Empath and Mayor.
    const g = cursedAfterChoosing(['philosopher', 'empath', 'imp', 'witch', 'clockmaker', 'mayor'], 'tea_lady', (g) => g.p.empath);
    expect(act(g, curse(g.p.empath, 'preview')).data).toMatchObject({ wouldDie: false, reason: expect.stringMatching(/Tea Lady/) });
  });

  it('a Philosopher who chose the Recluse can register as the Demon to a Slayer the day after', () => {
    const g = build(['philosopher', 'imp', 'witch', 'empath', 'slayer', 'mayor']);
    runNight(g, { [g.p.philosopher]: { philosopher: ['recluse'] }, [g.p.witch]: { witch: [g.p.mayor] } });
    const r = act(g, { ...shoot(g.p.slayer, g.p.philosopher, 'preview'), recluseAs: 'demon' as const });
    expect(r.data).toMatchObject({ wouldDie: true });
  });

  it('a Philosopher who chose the Moonchild and is executed the day after has the Moonchild\'s sobriety recorded', () => {
    const g = build(['philosopher', 'imp', 'witch', 'empath', 'clockmaker', 'mayor']);
    runNight(g, { [g.p.philosopher]: { philosopher: ['moonchild'] }, [g.p.witch]: { witch: [g.p.mayor] } });
    act(g, { type: 'record_execution', playerId: g.p.philosopher, died: true });
    expect(g.s.roleState[g.p.philosopher]?.soberAtDeath).toBe(true);
  });
});
