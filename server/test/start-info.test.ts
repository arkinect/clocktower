// Start information on gaining an ability (design.md section 5.7): a role whose information comes only on night 0
// (RoleData.startInfo: the Clockmaker, the Grandmother) gives it, once, the first night a gained ability is active.
import { describe, expect, it } from 'vitest';
import { ROLES } from '@ct/shared';
import { act, build, nextNight, resolve, resultFor, runNight, submit, type TestGame } from './helpers';
import { wakingRoles } from '../src/engine/actions';
import { markStartInfo, startInfoPending } from '../src/engine/world';

const ONE_STEP = ['The Demon is 1 step from its nearest Minion.'];

/** Seats: Philosopher, Imp, Poisoner, Empath, Butler. The Imp and Poisoner are neighbours: 1 step. */
function philosopherChooses(roleId: string): TestGame {
  const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler']);
  const { res } = runNight(g, { [g.p.philosopher]: { philosopher: [roleId] } });
  expect(resultFor(res, g.p.philosopher, roleId)).toBeUndefined(); // not on the choosing night
  return g;
}

describe('start information', () => {
  it('the start-information roles are the Clockmaker and the Grandmother', () => {
    expect(ROLES.filter((r) => r.startInfo).map((r) => r.id)).toEqual(['clockmaker', 'grandmother']);
  });

  it('marking ignores roles without start information, and marks a role once', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler']);
    markStartInfo(g.s, g.p.empath, 'empath');
    expect(g.s.roleState[g.p.empath]?.startInfoPending).toBeUndefined();
    markStartInfo(g.s, g.p.empath, 'clockmaker');
    markStartInfo(g.s, g.p.empath, 'clockmaker');
    markStartInfo(g.s, g.p.empath, 'grandmother');
    expect(startInfoPending(g.s, g.p.empath)).toEqual(['clockmaker', 'grandmother']);
  });

  it('a Philosopher who gains the Clockmaker learns the distance the next night, once', () => {
    const g = philosopherChooses('clockmaker');
    const pid = g.p.philosopher;
    expect(startInfoPending(g.s, pid)).toEqual(['clockmaker']);
    nextNight(g);
    expect(wakingRoles(g.s, pid)).toEqual(['clockmaker']);
    const { res } = runNight(g, {});
    const row = resultFor(res, pid, 'clockmaker')!;
    expect(row).toMatchObject({ title: 'Clockmaker', trueLines: ONE_STEP, finalLines: ONE_STEP, impaired: false });
    expect(g.s.messages[pid].filter((m) => m.night === 1).map((m) => m.title)).toEqual(['Clockmaker']);
    expect(startInfoPending(g.s, pid)).toEqual([]);
    expect(g.s.roleState[pid]).not.toHaveProperty('startInfoPending');
    // Never again.
    nextNight(g);
    expect(wakingRoles(g.s, pid)).toEqual([]);
    expect(resultFor(resolve(g), pid, 'clockmaker')).toBeUndefined();
  });

  it('an impaired Philosopher-Clockmaker gets false information, and the mark still clears', () => {
    const g = philosopherChooses('clockmaker');
    const pid = g.p.philosopher;
    nextNight(g);
    submit(g, { [g.p.poisoner]: { poisoner: [pid] } });
    const res = resolve(g);
    const row = resultFor(res, pid, 'clockmaker')!;
    expect(row.impaired).toBe(true);
    expect(row.trueLines).toEqual(ONE_STEP);
    expect(row.suggestedLines).not.toEqual(ONE_STEP);
    expect(row.suggestedLines[0]).toMatch(/^The Demon is \d steps? from its nearest Minion\.$/);
    act(g, { type: 'publish_night', force: true });
    expect(startInfoPending(g.s, pid)).toEqual([]);
    nextNight(g);
    expect(resultFor(resolve(g), pid, 'clockmaker')).toBeUndefined();
  });

  it('the Huntsman\'s Damsel turned Clockmaker learns the distance that night, once', () => {
    // Seats: Huntsman, Damsel, Imp, Poisoner, Empath, Butler.
    const g = build(['huntsman', 'damsel', 'imp', 'poisoner', 'empath', 'butler']);
    runNight(g, { [g.p.huntsman]: { huntsman: 'decline' } });
    nextNight(g);
    const { res } = runNight(g, { [g.p.huntsman]: { huntsman: [g.p.damsel] } }, { [`huntsman:${g.p.huntsman}`]: 'clockmaker' });
    expect(g.s.assignments[g.p.damsel].roleId).toBe('clockmaker');
    expect(resultFor(res, g.p.damsel, 'clockmaker')).toMatchObject({ title: 'Clockmaker', trueLines: ONE_STEP, impaired: false });
    expect(startInfoPending(g.s, g.p.damsel)).toEqual([]);
    nextNight(g);
    expect(wakingRoles(g.s, g.p.damsel)).toEqual([]);
    expect(resultFor(resolve(g), g.p.damsel, 'clockmaker')).toBeUndefined();
  });

  it('a Philosopher who gains the Grandmother learns a grandchild the next night, through startInfoPending', () => {
    const g = philosopherChooses('grandmother');
    const pid = g.p.philosopher;
    expect(g.s.roleState[pid]).toEqual({ startInfoPending: ['grandmother'] });
    nextNight(g);
    const res = resolve(g, { [`grandmother:${pid}`]: g.p.empath });
    expect(res.reviewItems.some((i) => i.key === `grandmother:${pid}`)).toBe(true);
    expect(resultFor(res, pid, 'grandmother')!.trueLines).toEqual([`Your grandchild is ${g.s.players.find((p) => p.id === g.p.empath)!.name}, the Empath.`]);
    act(g, { type: 'publish_night', force: true });
    expect(g.s.roleState[pid]).toEqual({ grandchildId: g.p.empath });
    nextNight(g);
    expect(resolve(g).reviewItems.some((i) => i.key === `grandmother:${pid}`)).toBe(false);
  });

  it('a gained role without start information is not marked', () => {
    const g = philosopherChooses('empath');
    expect(startInfoPending(g.s, g.p.philosopher)).toEqual([]);
  });

  it('the Clockmaker wakes on other nights only for a just-gained ability', () => {
    const g = build(['clockmaker', 'imp', 'poisoner', 'empath', 'butler']);
    const { res } = runNight(g, {});
    expect(resultFor(res, g.p.clockmaker, 'clockmaker')!.trueLines).toEqual(ONE_STEP);
    nextNight(g);
    expect(wakingRoles(g.s, g.p.clockmaker)).toEqual([]);
    expect(resultFor(resolve(g), g.p.clockmaker, 'clockmaker')).toBeUndefined();
  });
});
