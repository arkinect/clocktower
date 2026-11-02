// Start information on gaining an ability (design.md section 5.7): a role whose information comes only on night 0
// (RoleData.startInfo: the Clockmaker, the Grandmother) gives it, once, the night the ability is gained, even before
// the ability itself works. Other gained abilities still start the next night.
import { describe, expect, it } from 'vitest';
import { ROLES, type Resolution } from '@ct/shared';
import { build, nextNight, resolve, resultFor, runNight, type TestGame } from './helpers';
import { wakingRoles } from '../src/engine/actions';
import { markStartInfo, startInfoPending } from '../src/engine/world';

const ONE_STEP = ['The Demon is 1 step from its nearest Minion.'];

/**
 * Seats: Philosopher, Imp, Poisoner, Empath, Butler (the Imp and Poisoner are neighbours: 1 step). The Philosopher
 * waits on night 0 and chooses `roleId` on night 1, with the night's other choices and review choices given.
 */
function philosopherChoosesOnNight1(
  roleId: string,
  others: (p: Record<string, string>) => Record<string, Record<string, string[]>> = () => ({}),
  review: (p: Record<string, string>) => Record<string, string> = () => ({}),
): { g: TestGame; res: Resolution } {
  const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler']);
  runNight(g, { [g.p.philosopher]: { philosopher: 'decline' } });
  nextNight(g);
  const { final } = runNight(g, { [g.p.philosopher]: { philosopher: [roleId] }, ...others(g.p) }, review(g.p));
  return { g, res: final };
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

  it('a Philosopher who chooses the Clockmaker learns the distance that same night, once', () => {
    const { g, res } = philosopherChoosesOnNight1('clockmaker');
    const pid = g.p.philosopher;
    expect(resultFor(res, pid, 'clockmaker')).toMatchObject({ title: 'Clockmaker', trueLines: ONE_STEP, finalLines: ONE_STEP, impaired: false });
    expect(g.s.messages[pid].filter((m) => m.night === 1).map((m) => m.title)).toEqual(['Philosopher', 'Clockmaker']);
    expect(startInfoPending(g.s, pid)).toEqual([]);
    expect(g.s.roleState[pid]).not.toHaveProperty('startInfoPending');
    // Never again.
    nextNight(g);
    expect(wakingRoles(g.s, pid)).toEqual([]);
    expect(resultFor(resolve(g), pid, 'clockmaker')).toBeUndefined();
  });

  it('a Philosopher who chooses the Clockmaker on night 0 learns it on night 0', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler']);
    const { final } = runNight(g, { [g.p.philosopher]: { philosopher: ['clockmaker'] } });
    expect(resultFor(final, g.p.philosopher, 'clockmaker')!.trueLines).toEqual(ONE_STEP);
    expect(startInfoPending(g.s, g.p.philosopher)).toEqual([]);
    nextNight(g);
    expect(resultFor(resolve(g), g.p.philosopher, 'clockmaker')).toBeUndefined();
  });

  it('a Philosopher poisoned after choosing the Clockmaker gets false information, and the mark still clears', () => {
    // The Philosopher acts first (sober, so the ability is gained); the Poisoner then poisons them before the Clockmaker slot.
    const { g, res } = philosopherChoosesOnNight1('clockmaker', (p) => ({ [p.poisoner]: { poisoner: [p.philosopher] } }));
    const row = resultFor(res, g.p.philosopher, 'clockmaker')!;
    expect(row.impaired).toBe(true);
    expect(row.trueLines).toEqual(ONE_STEP);
    expect(row.suggestedLines).not.toEqual(ONE_STEP);
    expect(row.suggestedLines[0]).toMatch(/^The Demon is \d steps? from its nearest Minion\.$/);
    expect(g.s.assignments[g.p.philosopher].grantedAbility).toEqual({ roleId: 'clockmaker', fromNight: 2 });
    expect(startInfoPending(g.s, g.p.philosopher)).toEqual([]);
    nextNight(g);
    expect(resultFor(resolve(g), g.p.philosopher, 'clockmaker')).toBeUndefined();
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

  it('a Philosopher who chooses the Grandmother learns a grandchild that night; the link works from the next night', () => {
    // The Imp kills the Empath, who is chosen as the grandchild on the same night: no link yet.
    const { g, res } = philosopherChoosesOnNight1('grandmother', (p) => ({ [p.imp]: { imp: [p.empath] } }), (p) => ({ [`grandmother:${p.philosopher}`]: p.empath }));
    const pid = g.p.philosopher;
    expect(res.reviewItems.some((i) => i.key === `grandmother:${pid}`)).toBe(true);
    expect(resultFor(res, pid, 'grandmother')!.trueLines).toEqual([`Your grandchild is ${g.s.players.find((p) => p.id === g.p.empath)!.name}, the Empath.`]);
    expect(res.reviewItems.some((i) => i.kind === 'grandmother_link')).toBe(false);
    expect(res.deaths).toEqual([g.p.empath]);
    expect(g.s.roleState[pid]).toEqual({ grandchildId: g.p.empath });
    nextNight(g);
    expect(resolve(g).reviewItems.some((i) => i.key === `grandmother:${pid}`)).toBe(false);
  });

  it('a Philosopher-Grandmother\'s link works from the next night', () => {
    const { g } = philosopherChoosesOnNight1('grandmother');
    const gc = g.s.roleState[g.p.philosopher].grandchildId as string;
    expect(gc).toBeTruthy();
    nextNight(g);
    runNight(g, { [g.p.imp]: { imp: [gc] } });
    expect(g.s.players.find((p) => p.id === g.p.philosopher)!.alive).toBe(false);
  });

  it('a gained ability without start information still starts the next night', () => {
    const { g, res } = philosopherChoosesOnNight1('empath');
    expect(resultFor(res, g.p.philosopher, 'empath')).toBeUndefined();
    expect(startInfoPending(g.s, g.p.philosopher)).toEqual([]);
    nextNight(g);
    expect(resultFor(resolve(g), g.p.philosopher, 'empath')).toBeDefined();
  });

  it('the Clockmaker wakes on other nights only for an ability just gained', () => {
    const g = build(['clockmaker', 'imp', 'poisoner', 'empath', 'butler']);
    const { res } = runNight(g, {});
    expect(resultFor(res, g.p.clockmaker, 'clockmaker')!.trueLines).toEqual(ONE_STEP);
    nextNight(g);
    expect(wakingRoles(g.s, g.p.clockmaker)).toEqual([]);
    expect(resultFor(resolve(g), g.p.clockmaker, 'clockmaker')).toBeUndefined();
  });
});
