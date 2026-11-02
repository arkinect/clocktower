// The Fisherman, Zealot, Baron and Organ Grinder (design.md section 14): script, setup counts, the Organ Grinder's
// nightly choice and eyes-closed voting.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { GameState } from '@ct/shared';
import { act, build, nextNight, resolve, runNight, submit, tryAct } from './helpers';
import { applyIntent, createGame } from '../src/engine/game';
import { actionSpecs } from '../src/engine/actions';
import { bluffCandidates, enabledRoles, outsidersBeforeGodfather, suggestDistribution, targetCounts } from '../src/engine/setup';
import { makeRng } from '../src/engine/rng';
import { adminView } from '../src/engine/views';
import { eyesClosedVotingToday } from '../src/engine/roles';

const NEW = ['fisherman', 'zealot', 'baron', 'organ_grinder'];

describe('script', () => {
  it('a game whose script lacks the new roles never offers them', () => {
    const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler', 'gambler', 'sailor'], (g) => {
      for (const r of NEW) act(g, { type: 'set_role_enabled', roleId: r, enabled: false });
    });
    expect(enabledRoles(g.s).filter((r) => NEW.includes(r))).toEqual([]);
    expect(bluffCandidates(g.s).filter((r) => NEW.includes(r))).toEqual([]);
    const options = actionSpecs(g.s, g.p.philosopher)[0].fields[0].options;
    expect(options).toContain('empath');
    expect(options.filter((r) => NEW.includes(r))).toEqual([]);
    runNight(g, {});
    nextNight(g);
    const gambler = actionSpecs(g.s, g.p.gambler)[0].fields[1].options;
    expect(gambler).toContain('imp');
    expect(gambler.filter((r) => NEW.includes(r))).toEqual([]);
    expect(tryAct(g, { type: 'assign_role', playerId: g.p.empath, roleId: 'fisherman' }).ok).toBe(false);
  });

  it('suggested distributions never use roles off the script', () => {
    const s = createGame('x', 0);
    s.script = s.script.filter((r) => !NEW.includes(r));
    s.players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, seat: i, isAdmin: false, alive: true }) as GameState['players'][number]);
    for (let seed = 1; seed <= 40; seed++) {
      const d = suggestDistribution(s, makeRng(seed));
      if ('error' in d) throw new Error(d.error);
      expect(Object.values(d).filter((r) => NEW.includes(r))).toEqual([]);
    }
  });

  it('a game saved before these roles existed has none of them on its script, and Play again keeps it so', () => {
    const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v7-ended.json'), 'utf8')) as GameState;
    expect(enabledRoles(s).filter((r) => NEW.includes(r))).toEqual([]);
    const r = applyIntent(s, s.adminId!, { type: 'play_again' }, { now: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(enabledRoles(r.state).filter((x) => NEW.includes(x))).toEqual([]);
  });
});

describe('Baron setup counts', () => {
  const counts = (players: number, roles: string[], godfather: 1 | -1 | null = null) => {
    const s = createGame('x', 0);
    s.setup.godfatherOutsiders = godfather;
    return targetCounts(s, players, roles).counts;
  };

  it('+2 Outsiders, taken from the Townsfolk', () => {
    expect(counts(7, [])).toEqual([5, 0, 1, 1]);
    expect(counts(7, ['baron'])).toEqual([3, 2, 1, 1]);
    expect(counts(8, ['baron'])).toEqual([3, 3, 1, 1]);
  });

  it('stacked with the Godfather: -1 or +1 decided from the Outsiders after the other modifiers', () => {
    expect(counts(8, ['baron', 'godfather'], 1)).toEqual([2, 4, 1, 1]);
    expect(counts(8, ['baron', 'godfather'], -1)).toEqual([4, 2, 1, 1]);
    // 7 players: the chart has no Outsiders, the Baron adds two, so the Storyteller can choose 1 or 3.
    expect(outsidersBeforeGodfather(7, ['baron', 'godfather'])).toBe(2);
    expect(counts(7, ['baron', 'godfather'], -1)).toEqual([4, 1, 1, 1]);
    expect(counts(7, ['baron', 'godfather'], 1)).toEqual([2, 3, 1, 1]);
    // Without the Baron, 7 players: only +1. With the Vigormortis taking the 8-player chart's only Outsider: only +1.
    expect(outsidersBeforeGodfather(7, ['godfather'])).toBe(0);
    expect(counts(7, ['godfather'], -1)).toEqual([4, 1, 1, 1]);
    expect(outsidersBeforeGodfather(8, ['godfather', 'vigormortis'])).toBe(0);
    expect(counts(8, ['godfather', 'vigormortis'], -1)).toEqual([5, 1, 1, 1]);
    // The Balloonist adds one to remove on a 7-player chart.
    expect(counts(7, ['godfather', 'balloonist'], -1)).toEqual([5, 0, 1, 1]);
  });

  it('the Storyteller can choose -1 with 7 players when the Baron is in play, and not without it', () => {
    const roles = ['godfather', 'baron', 'imp', 'empath', 'sailor', 'butler', 'drunk'];
    const g = build(roles, (g) => {
      act(g, { type: 'set_godfather_outsiders', value: -1 });
      const view = adminView(g.s, g.admin, 0, {});
      expect(view.typeCounts).toMatchObject({ chartOutsiders: 0, outsidersBeforeGodfather: 2, target: [4, 1, 1, 1] });
    });
    expect(g.s.setup.godfatherOutsiders).toBe(-1);
    act(g, { type: 'end_game' });
    act(g, { type: 'play_again' });
    const ids = g.s.players.filter((p) => !p.isAdmin).map((p) => p.id);
    act(g, { type: 'assign_role', playerId: ids[0], roleId: 'godfather' });
    expect(tryAct(g, { type: 'set_godfather_outsiders', value: -1 }).ok).toBe(false);
    act(g, { type: 'assign_role', playerId: ids[1], roleId: 'baron' });
    expect(tryAct(g, { type: 'set_godfather_outsiders', value: -1 }).ok).toBe(true);
  });

  it('stacked with the Vigormortis and the Balloonist', () => {
    expect(counts(8, ['baron', 'vigormortis'])).toEqual([4, 2, 1, 1]);
    expect(counts(8, ['baron', 'balloonist'])).toEqual([2, 4, 1, 1]);
    expect(counts(10, ['baron', 'godfather', 'vigormortis', 'balloonist'], 1)).toEqual([4, 3, 2, 1]);
  });

  it('suggested distributions follow the Baron\'s counts', () => {
    const g = build(['baron', 'imp', 'empath', 'sailor', 'butler', 'drunk', 'clockmaker']);
    expect(adminView(g.s, g.admin, 0, {}).typeCounts.target).toEqual([3, 2, 1, 1]);
  });
});

describe('Organ Grinder', () => {
  /** Seats: Organ Grinder, Poisoner, Imp, Empath, Butler. */
  const game = () => build(['organ_grinder', 'poisoner', 'imp', 'empath', 'butler']);
  const eyesClosed = (g: ReturnType<typeof game>) => adminView(g.s, g.admin, 0, {}).eyesClosedVoting;

  it('wakes every night with a Drunk / Sober choice and no decline', () => {
    const g = game();
    const [spec] = actionSpecs(g.s, g.p.organ_grinder);
    expect(spec).toMatchObject({
      key: 'organ_grinder', allowDecline: false,
      fields: [{ kind: 'option', options: ['drunk', 'sober'], labels: { drunk: 'Drunk until dusk', sober: 'Stay sober' } }],
    });
    expect(tryAct(g, { type: 'submit_night', actions: { organ_grinder: { values: ['maybe'] } } }, g.p.organ_grinder).ok).toBe(false);
    expect(tryAct(g, { type: 'submit_night', actions: { organ_grinder: { decline: true, values: [] } } }, g.p.organ_grinder).ok).toBe(false);
    runNight(g, {});
    nextNight(g);
    expect(actionSpecs(g.s, g.p.organ_grinder).map((s) => s.key)).toEqual(['organ_grinder']);
  });

  it('drunk: drunk until dusk (own cause), so no eyes-closed voting that day', () => {
    const g = game();
    runNight(g, { [g.p.organ_grinder]: { organ_grinder: ['drunk'] } });
    expect(g.s.effects).toContainEqual(expect.objectContaining({
      type: 'drunk', cause: 'organ_grinder', sourcePlayerId: g.p.organ_grinder, targetPlayerId: g.p.organ_grinder, expiry: 'until_dusk',
    }));
    expect(adminView(g.s, g.admin, 0, {}).impairment[g.p.organ_grinder]).toEqual({ impaired: true, causes: ['drunk:organ_grinder'] });
    expect(eyesClosed(g)).toBe(false);
    nextNight(g);
    expect(g.s.effects.some((e) => e.cause === 'organ_grinder')).toBe(false); // cleared at dusk
  });

  it('sober, or no submission: eyes-closed voting today', () => {
    const g = game();
    const { final } = runNight(g, { [g.p.organ_grinder]: { organ_grinder: ['sober'] } });
    expect(final.actors.find((a) => a.playerId === g.p.organ_grinder)!.outcome).toBe('stays sober');
    expect(eyesClosed(g)).toBe(true);
    expect(eyesClosedVotingToday(g.s)).toBe(true);
    nextNight(g);
    expect(eyesClosedVotingToday(g.s)).toBe(false); // a day-time banner only
    const res = resolve(g);
    expect(res.actors.find((a) => a.playerId === g.p.organ_grinder)!.outcome).toBe('no choice: stays sober');
    act(g, { type: 'publish_night', force: true });
    expect(g.s.effects.some((e) => e.cause === 'organ_grinder')).toBe(false);
    expect(eyesClosed(g)).toBe(true);
  });

  it('poisoned: no eyes-closed voting, and choosing drunk does nothing', () => {
    const g = game();
    runNight(g, { [g.p.poisoner]: { poisoner: [g.p.organ_grinder] }, [g.p.organ_grinder]: { organ_grinder: ['drunk'] } });
    expect(g.s.effects.some((e) => e.cause === 'organ_grinder')).toBe(false);
    expect(eyesClosed(g)).toBe(false);
  });

  it('dead: no eyes-closed voting', () => {
    const g = game();
    runNight(g, { [g.p.organ_grinder]: { organ_grinder: ['sober'] } });
    expect(eyesClosed(g)).toBe(true);
    act(g, { type: 'record_execution', playerId: g.p.organ_grinder, died: true });
    expect(eyesClosed(g)).toBe(false);
  });

  it('a player who only believes they are the Organ Grinder causes no eyes-closed voting', () => {
    // Setup only lets a Drunk believe a Townsfolk; this sets a believed Organ Grinder afterwards, to check it isn't real.
    const g = build(['drunk', 'philosopher', 'imp', 'poisoner', 'empath']);
    g.s.assignments[g.p.drunk].believedRoleId = 'organ_grinder';
    runNight(g, { [g.p.drunk]: { organ_grinder: ['sober'] } });
    expect(eyesClosed(g)).toBe(false);
  });
});
