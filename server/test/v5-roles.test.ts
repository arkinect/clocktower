// Worked examples for the seven roles added in schema v5 (design.md section 18).
import { describe, expect, it } from 'vitest';
import type { GameState } from '@ct/shared';
import { act, build, nextNight, publishAndDay, resolve, resultFor, runNight, submit, tryAct } from './helpers';
import { playerView } from '../src/engine/views';
import { actionSpecs } from '../src/engine/actions';
import { computeImpairment } from '../src/engine/impairment';
import { targetCounts } from '../src/engine/setup';
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

  it('3. Farmer killed at night: an alive good player becomes a Farmer', () => {
    const g = build(['farmer', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'poisoner']);
    runNight(g, {});
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.farmer] } });
    let res = resolve(g);
    const item = res.reviewItems.find((i) => i.kind === 'farmer')!;
    expect(item.options.map((o) => o.id)).not.toContain(g.p.imp);
    expect(item.options.map((o) => o.id)).not.toContain(g.p.farmer);
    res = resolve(g, { [item.key]: g.p.empath });
    expect(res.after.assignments[g.p.empath].roleId).toBe('farmer');
    expect(res.after.assignments[g.p.empath].alignment).toBe('good');
    expect(res.notices.some((n) => n.playerId === g.p.empath && n.title === 'You are now a Farmer')).toBe(true);
    // The new Farmer does not act as the Empath tonight.
    expect(resultFor(res, g.p.empath)).toBeUndefined();
    publishAndDay(g);
    expect(playerView(g.s, g.p.empath, 0).me.role!.roleId).toBe('farmer');
  });

  it('3b. Farmer: a day death or an impaired death makes no Farmer', () => {
    const g = build(['farmer', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'poisoner']);
    runNight(g, {});
    act(g, { type: 'record_execution', playerId: g.p.farmer, died: true });
    nextNight(g);
    expect(resolve(g).reviewItems.some((i) => i.kind === 'farmer')).toBe(false);

    const h = build(['farmer', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'poisoner']);
    runNight(h, {});
    nextNight(h);
    submit(h, { [h.p.poisoner]: { poisoner: [h.p.farmer] }, [h.p.imp]: { imp: [h.p.farmer] } });
    const res = resolve(h);
    expect(res.deaths).toEqual([h.p.farmer]);
    expect(res.reviewItems.some((i) => i.kind === 'farmer')).toBe(false);
  });

  it('4. Al-Hadikhia: chosen players answer on their phones; all live means all die', () => {
    const g = build(['al_hadikhia', 'poisoner', 'empath', 'clockmaker', 'butler', 'virgin', 'oracle']);
    runNight(g, {});
    nextNight(g);
    const trio = [g.p.empath, g.p.clockmaker, g.p.virgin];
    submit(g, { [g.p.al_hadikhia]: { al_hadikhia: trio } });
    let res = resolve(g);
    expect(res.awaitingAlHadikhia.sort()).toEqual(trio.slice().sort());
    expect(playerView(g.s, g.p.empath, 0).me.alHadikhiaPrompt).toEqual({ chosen: trio });
    expect(playerView(g.s, g.p.butler, 0).me.alHadikhiaPrompt).toBeNull();
    expect(tryAct(g, { type: 'publish_night' }).ok).toBe(false);
    expect(tryAct(g, { type: 'submit_alhadikhia', live: true }, g.p.butler).ok).toBe(false);
    for (const id of trio) act(g, { type: 'submit_alhadikhia', live: true }, id);
    res = g.s.night!.resolution!;
    expect(res.awaitingAlHadikhia).toEqual([]);
    expect(playerView(g.s, g.p.empath, 0).me.alHadikhiaPrompt).toBeNull();
    expect(res.deaths.sort()).toEqual(trio.slice().sort());
    expect(res.notices.filter((n) => n.title === 'Al-Hadikhia').length).toBe(7);
    publishAndDay(g);
  });

  it('4b. Al-Hadikhia: one dies, the rest live; a dead player who chooses life returns; impaired does nothing', () => {
    const g = build(['al_hadikhia', 'poisoner', 'empath', 'clockmaker', 'butler', 'virgin', 'oracle']);
    runNight(g, {});
    act(g, { type: 'record_execution', playerId: g.p.butler, died: true });
    nextNight(g);
    submit(g, { [g.p.al_hadikhia]: { al_hadikhia: [g.p.empath, g.p.clockmaker, g.p.butler] } });
    resolve(g);
    act(g, { type: 'submit_alhadikhia', live: false }, g.p.empath);
    act(g, { type: 'submit_alhadikhia', live: true }, g.p.clockmaker);
    // The Admin answers for the dead Butler.
    const res = resolve(g, { [`alhadikhia:${g.p.butler}`]: 'live' });
    expect(res.deaths).toEqual([g.p.empath]);
    expect(res.revived).toEqual([g.p.butler]);
    expect(res.awaitingAlHadikhia).toEqual([]);
    expect(res.reviewItems.find((i) => i.key === `alhadikhia:${g.p.butler}`)!.description).toBe('Answered by you.');

    const h = build(['al_hadikhia', 'poisoner', 'empath', 'clockmaker', 'butler', 'virgin', 'oracle']);
    runNight(h, {});
    nextNight(h);
    const trio = [h.p.empath, h.p.clockmaker, h.p.virgin];
    submit(h, { [h.p.poisoner]: { poisoner: [h.p.al_hadikhia] }, [h.p.al_hadikhia]: { al_hadikhia: trio } });
    resolve(h);
    for (const id of trio) act(h, { type: 'submit_alhadikhia', live: true }, id);
    expect(h.s.night!.resolution!.deaths).toEqual([]);
  });

  it('5. Cannibal eats a good executee: wakes with their ability, titled "Cannibal"', () => {
    const g = build(['cannibal', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'poisoner']);
    runNight(g, {});
    act(g, { type: 'record_execution', playerId: g.p.empath, died: true });
    expect(g.s.assignments[g.p.cannibal].eatenAbility).toMatchObject({ roleId: 'empath', fake: false, executeeId: g.p.empath });
    nextNight(g);
    const res = resolve(g);
    const r = resultFor(res, g.p.cannibal, 'empath')!;
    expect(r.title).toBe('Cannibal');
    expect(r.trueLines[0]).toMatch(/alive neighbours/);
  });

  it('5b. Cannibal eats an evil executee: poisoned until a good player dies by execution', () => {
    const g = build(['cannibal', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'poisoner']);
    runNight(g, {});
    act(g, { type: 'record_execution', playerId: g.p.poisoner, died: true });
    expect(computeImpairment(g.s, 1)[g.p.cannibal].causes).toContain('poisoned:cannibal');
    expect(g.s.assignments[g.p.cannibal].eatenAbility).toMatchObject({ roleId: null, fake: true });
    // The Admin gives the Cannibal the ability the Poisoner was bluffing.
    act(g, { type: 'set_cannibal_ability', playerId: g.p.cannibal, roleId: 'fortune_teller' });
    nextNight(g);
    const spec = actionSpecs(g.s, g.p.cannibal).find((s) => s.key === 'fortune_teller')!;
    expect(spec.title).toBe('Cannibal');
    submit(g, { [g.p.cannibal]: { fortune_teller: [g.p.imp, g.p.butler] } });
    const res = resolve(g);
    const r = resultFor(res, g.p.cannibal, 'fortune_teller')!;
    expect(r.impaired).toBe(true);
    expect(r.title).toBe('Cannibal');
    expect(res.abnormal.some((e) => e.playerId === g.p.cannibal)).toBe(false);
    publishAndDay(g);
    act(g, { type: 'record_execution', playerId: g.p.virgin, died: true });
    expect(computeImpairment(g.s, 2)[g.p.cannibal].impaired).toBe(false);
    expect(g.s.assignments[g.p.cannibal].eatenAbility?.roleId).toBe('virgin');
  });

  it('5c. Cannibal: an execution that does not kill changes nothing; a dead Cannibal gains nothing', () => {
    const g = build(['cannibal', 'imp', 'empath', 'clockmaker', 'butler', 'virgin', 'poisoner']);
    runNight(g, {});
    act(g, { type: 'record_execution', playerId: g.p.empath, died: false });
    expect(g.s.assignments[g.p.cannibal].eatenAbility ?? null).toBeNull();
    act(g, { type: 'mark_alive', playerId: g.p.cannibal, alive: false });
    act(g, { type: 'record_execution', playerId: g.p.clockmaker, died: true });
    expect(g.s.assignments[g.p.cannibal].eatenAbility ?? null).toBeNull();
  });

  it('6. Migration v4 -> v5 enables the new roles and fills night fields', () => {
    const s = createGame('m', 0) as GameState & { schemaVersion: number };
    for (const r of ['fisherman', 'cannibal', 'farmer', 'zealot', 'organ_grinder', 'baron', 'al_hadikhia']) delete s.enabledRoles[r];
    s.schemaVersion = 4;
    s.night = { number: 1, collectingOpen: true, submissions: {}, ravenSubmissions: {}, seed: 1, reviewChoices: {}, overrides: {}, mathAdjust: { add: [], remove: [] }, resolution: null } as unknown as GameState['night'];
    const m = migrate(s);
    expect(m.schemaVersion).toBe(5);
    expect(m.enabledRoles.al_hadikhia).toBe(true);
    expect(m.enabledRoles.baron).toBe(true);
    expect(m.night!.alHadikhiaChoices).toEqual({});
  });
});
