// Worked examples for the four roles added in schema v5 (design.md section 18).
import { describe, expect, it } from 'vitest';
import { JINXES, ROLE_BY_ID, type GameState } from '@ct/shared';
import { act, build, nextNight, publishAndDay, resolve, submit } from './helpers';
import { actionSpecs } from '../src/engine/actions';
import { computeImpairment } from '../src/engine/impairment';
import { setupChecklist, setupWarnings, targetCounts } from '../src/engine/setup';
import { migrate } from '../src/engine/migrate';
import { createGame } from '../src/engine/game';

describe('v5 roles', () => {
  it('1. Baron adds 2 Outsiders at setup', () => {
    const g = build(['baron', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'oracle']);
    expect(targetCounts(g.s, 7, ['baron', 'imp']).counts).toEqual([3, 2, 1, 1]);
  });

  it('2. Organ Grinder: choosing yourself is drunk until dusk, self-caused, cleared at the next night', () => {
    const g = build(['organ_grinder', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'mathematician']);
    const spec = actionSpecs(g.s, g.p.organ_grinder).find((s) => s.key === 'organ_grinder')!;
    expect(spec.fields[0].options).toEqual([g.p.organ_grinder]);
    expect(spec.declineLabel).toBe('Stay sober');
    submit(g, { [g.p.organ_grinder]: { organ_grinder: [g.p.organ_grinder] } });
    const res = resolve(g);
    expect(computeImpairment(res.after, 0)[g.p.organ_grinder].causes).toContain('drunk:organ_grinder');
    expect(res.abnormal.some((e) => e.playerId === g.p.organ_grinder)).toBe(false);
    publishAndDay(g);
    nextNight(g);
    expect(g.s.effects.some((e) => e.cause === 'organ_grinder')).toBe(false);
    submit(g, { [g.p.organ_grinder]: { organ_grinder: 'decline' } });
    expect(resolve(g).after.effects.some((e) => e.cause === 'organ_grinder')).toBe(false);
  });

  it('3. Fisherman and Zealot never wake', () => {
    const g = build(['fisherman', 'imp', 'empath', 'clockmaker', 'zealot', 'virgin', 'oracle']);
    expect(actionSpecs(g.s, g.p.fisherman)).toEqual([]);
    expect(actionSpecs(g.s, g.p.zealot)).toEqual([]);
  });

  it('4. Migration v4 -> v5 enables the new roles', () => {
    const s = createGame('m', 0) as GameState & { schemaVersion: number };
    for (const r of ['fisherman', 'zealot', 'organ_grinder', 'baron']) delete s.enabledRoles[r];
    s.schemaVersion = 4;
    const m = migrate(s);
    expect(m.schemaVersion).toBe(5);
    expect(m.enabledRoles.fisherman && m.enabledRoles.zealot && m.enabledRoles.organ_grinder && m.enabledRoles.baron).toBe(true);
  });
});

describe('jinxes', () => {
  it('every jinx names two roles the app has', () => {
    for (const j of JINXES) expect(!!ROLE_BY_ID[j.a] && !!ROLE_BY_ID[j.b]).toBe(true);
  });

  it('Marionette + Huntsman needs the Damsel; Marionette + Balloonist warns about an extra Outsider', () => {
    build(['marionette', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'oracle'], (g) => {
      act(g, { type: 'set_believed_role', playerId: g.p.marionette, roleId: 'huntsman' });
      expect(setupChecklist(g.s).find((c) => c.id === 'huntsman')).toMatchObject({ done: false, blocking: true });
      act(g, { type: 'set_believed_role', playerId: g.p.marionette, roleId: 'balloonist' });
      expect(setupWarnings(g.s).some((w) => w.startsWith('Jinx (Marionette & Balloonist):'))).toBe(true);
    });
  });
});
