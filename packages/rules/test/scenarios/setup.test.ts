// Setup: the script, type counts with every modifier, and the checklist.
import { describe, expect, it } from 'vitest';
import { allRoles, defaultScript, findRole } from '../../src';
import { makeRng } from '../../src/util/rng';
import {
  bluffCandidates,
  setupChecklist,
  setupWarnings,
  suggestDistribution,
  targetCounts,
} from '../../src/setup/rules';
import { as, chosen } from '../helpers/scene';
import { seated, ST } from '../helpers/game';
import { scene, type Scene } from '../scenario';

const twelve = 'Ann Bo Cy Di Ed Flo Gus Hal Ivy Jo Kim Lee'.split(' ');
const towns = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'];

/** A setup of n seats holding these roles, with the rest plain Townsfolk. */
const table = (n: number, roles: string[], outsiders?: '+1' | '-1') => {
  const names = twelve.slice(0, n).map((x) => x.toLowerCase());
  const pool = [...roles, ...towns];
  const chars = Object.fromEntries(names.map((name, i) => [name, pool[i] as string]));
  return scene(chars, outsiders ? { fields: { godfather: { outsiders } } } : {});
};
const counts = (s: Scene) => s.g.grimoire().setup.counts.target;

describe('the script', () => {
  const NEW = ['fisherman', 'zealot', 'baron', 'organ_grinder', 'cannibal', 'farmer'];
  const off = (s: Scene) => s.g.st({ type: 'set_script', roleIds: s.state.script.filter((r) => !NEW.includes(r)) });

  it('a game whose script lacks a role never offers it', () => {
    const s = scene({
      ann: 'philosopher',
      bo: 'imp',
      cy: 'poisoner',
      di: 'empath',
      ed: 'butler',
      fi: 'gambler',
      gus: 'sailor',
    });
    off(s);
    const strays = (options: readonly string[] = []) => options.filter((r) => NEW.includes(r));
    expect(strays(bluffCandidates(s.state))).toEqual([]);
    expect(
      s.g.rejected(ST, { type: 'assign_character', playerId: as('di'), roleId: chosen('fisherman') }),
    ).toBeTruthy();
    s.start();
    const philosopher = s.specs('ann')[0]?.fields[0]?.options;
    expect(philosopher).toContain('empath');
    expect(strays(philosopher)).toEqual([]);
    s.nextNight();
    expect(s.specs('fi')[0]?.fields[1]?.options).toContain('imp');
    expect(strays(s.specs('fi')[0]?.fields[1]?.options)).toEqual([]);
  });

  it('suggested distributions never use roles off the script', () => {
    const g = seated(twelve);
    g.st({ type: 'set_script', roleIds: defaultScript().filter((r) => !NEW.includes(r)) });
    for (let seed = 1; seed <= 40; seed++) {
      const d = suggestDistribution(g.state, makeRng(seed));
      if ('error' in d) throw new Error(d.error);
      expect(Object.values(d).filter((r) => NEW.includes(r))).toEqual([]);
    }
  });

  it('an unknown id on the script is left out of views, assignment and the checklist', () => {
    const s = scene({ ann: 'imp', bo: 'empath', cy: 'sailor', di: 'butler', ed: 'poisoner' });
    s.g.state = { ...s.state, script: [...s.state.script, chosen('no_such_role')] };
    expect(bluffCandidates(s.state)).not.toContain('no_such_role');
    expect(
      s.g.rejected(ST, { type: 'assign_character', playerId: as('bo'), roleId: chosen('no_such_role') }),
    ).toBeTruthy();
    expect(JSON.stringify(setupChecklist(s.state))).not.toContain('no_such_role');
    const view = s.g.grimoire();
    expect(JSON.stringify(view.setup.checklist) + JSON.stringify(view.setup.warnings)).not.toContain('no_such_role');
    expect(JSON.stringify(s.g.view(as('bo')))).not.toContain('no_such_role');
  });
});

describe('type counts', () => {
  it('the Baron adds 2 Outsiders, taken from the Townsfolk', () => {
    expect(counts(table(7, []))).toEqual([5, 0, 1, 1]);
    expect(counts(table(7, ['baron']))).toEqual([3, 2, 1, 1]);
    expect(counts(table(8, ['baron']))).toEqual([3, 3, 1, 1]);
  });

  it('with the Godfather, -1 or +1 is decided from the Outsiders after the other modifiers', () => {
    expect(counts(table(8, ['baron', 'godfather'], '+1'))).toEqual([2, 4, 1, 1]);
    expect(counts(table(8, ['baron', 'godfather'], '-1'))).toEqual([4, 2, 1, 1]);
    expect(counts(table(7, ['baron', 'godfather'], '-1'))).toEqual([4, 1, 1, 1]);
    expect(counts(table(7, ['baron', 'godfather'], '+1'))).toEqual([2, 3, 1, 1]);
    expect(counts(table(8, ['godfather'], '+1'))).toEqual([4, 2, 1, 1]);
    expect(counts(table(8, ['godfather'], '-1'))).toEqual([6, 0, 1, 1]);
  });

  it('-1 cannot be chosen with no Outsider to remove', () => {
    expect(() => table(7, ['godfather'], '-1')).toThrow();
    expect(() => table(8, ['godfather', 'vigormortis'], '-1')).toThrow();
  });

  it('a Balloonist gives the Godfather an Outsider to remove', () => {
    expect(counts(table(7, ['godfather', 'balloonist'], '-1'))).toEqual([5, 0, 1, 1]);
  });

  it('the Storyteller can choose -1 with 7 players when the Baron is in play, and it survives the Baron leaving as +1', () => {
    const s = table(7, ['godfather', 'baron'], '-1');
    const label = () => setupChecklist(s.state).find((c) => c.id.includes('godfather'))?.label;
    expect(label()).toContain('(chosen: -1)');
    s.g.st({ type: 'assign_character', playerId: as('bo'), roleId: chosen('poisoner') });
    expect(label()).toContain('(chosen: +1)');
    const field = s.g.grimoire().setup.fields.find((x) => x.field === 'outsiders');
    expect(field?.value).toBe('+1');
    expect(field?.options.map((o) => o.id)).toEqual(['+1']);
  });

  it('stacked with the Vigormortis and the Balloonist', () => {
    expect(counts(table(8, ['baron', 'vigormortis']))).toEqual([4, 2, 1, 1]);
    expect(counts(table(8, ['baron', 'balloonist']))).toEqual([2, 4, 1, 1]);
    expect(counts(table(10, ['baron', 'godfather', 'vigormortis', 'balloonist'], '+1'))).toEqual([4, 3, 2, 1]);
  });

  it("the Lil' Monsta leaves the chart unchanged at every size", () => {
    for (const [n, chart, minions] of [
      [7, [5, 0, 1, 1], 1],
      [10, [7, 0, 2, 1], 2],
      [12, [7, 2, 2, 1], 2],
    ] as const) {
      const g = table(n, ['lil_monsta', ...['assassin', 'witch', 'mezepheles'].slice(0, minions)]);
      expect(targetCounts(g.state, n, [chosen('lil_monsta')]).counts, `${n} players`).toEqual(chart);
    }
  });

  it("a suggested distribution with the Lil' Monsta follows the chart", () => {
    const g = seated(twelve.slice(0, 7));
    const demons = allRoles()
      .filter((r) => r.type === 'demon' && r.id !== 'lil_monsta')
      .map((r) => r.id);
    const skip = [...demons, 'baron', 'godfather', 'balloonist'].map(String);
    g.st({ type: 'set_script', roleIds: defaultScript().filter((r) => !skip.includes(r)) });
    const d = suggestDistribution(g.state, makeRng(7));
    if ('error' in d) throw new Error(d.error);
    const types = Object.values(d).map((r) => findRole(r)?.type);
    expect(Object.values(d)).toContain('lil_monsta');
    expect(['townsfolk', 'outsider', 'minion', 'demon'].map((x) => types.filter((y) => y === x).length)).toEqual([
      5, 0, 1, 1,
    ]);
  });

  it('suggested distributions never put the Vigormortis and Scarlet Woman together, and a manual pairing warns', () => {
    const s = scene({ ann: 'vigormortis', bo: 'scarlet_woman', cy: 'empath', di: 'butler', ed: 'sailor' });
    expect(setupWarnings(s.state).some((w) => /should not be in the same game/.test(w))).toBe(true);
    for (let seed = 0; seed < 300; seed++) {
      const d = suggestDistribution(s.state, makeRng(seed));
      if ('error' in d) continue;
      const roles = Object.values(d) as string[];
      expect(roles.includes('vigormortis') && roles.includes('scarlet_woman')).toBe(false);
    }
  });
});

describe('the checklist', () => {
  it('a Huntsman without the Damsel blocks night 0, and the Damsel clears it', () => {
    const s = scene({ ann: 'huntsman', bo: 'imp', cy: 'empath', di: 'butler', ed: 'sailor' });
    expect(s.g.tryAs(ST, { type: 'begin_first_night', force: false }).ok).toBe(false);
    s.g.st({ type: 'assign_character', playerId: as('di'), roleId: chosen('damsel') });
    expect(
      setupChecklist(s.state)
        .filter((c) => c.label.includes('Damsel'))
        .every((c) => c.done),
    ).toBe(true);
  });

  it('a Drunk with no believed character blocks night 0', () => {
    const s = scene({ ann: 'imp', bo: 'drunk', cy: 'empath', di: 'butler', ed: 'sailor' });
    s.g.st({ type: 'suggest_bluffs' });
    expect(s.g.tryAs(ST, { type: 'begin_first_night', force: false }).ok).toBe(false);
  });

  it('Jinx (Marionette & Huntsman): blocks until the Damsel is in play, and only for that belief', () => {
    const chars = { ann: 'imp', bo: 'marionette', cy: 'empath', di: 'butler', ed: 'sailor', fi: 'clockmaker' };
    const none = scene(chars, { believed: { bo: 'seamstress' } });
    expect(setupChecklist(none.state).some((c) => c.id.startsWith('jinx:'))).toBe(false);
    const s = scene(chars, { believed: { bo: 'huntsman' } });
    const item = () => setupChecklist(s.state).find((c) => c.id === 'jinx:marionette:huntsman');
    expect(item()).toMatchObject({ done: false, blocking: true });
    expect(item()?.label).toMatch(/^Jinx \(Marionette & Huntsman\): /);
    expect(s.g.tryAs(ST, { type: 'begin_first_night', force: false }).ok).toBe(false);
    s.g.st({ type: 'assign_character', playerId: as('di'), roleId: chosen('damsel') });
    expect(item()).toMatchObject({ done: true, blocking: true });
  });

  it('Jinx (Marionette & Balloonist): warns only for that belief', () => {
    const chars = { ann: 'imp', bo: 'marionette', cy: 'empath', di: 'butler', ed: 'sailor', fi: 'clockmaker' };
    const jinx = (s: Scene) => setupWarnings(s.state).filter((w) => w.startsWith('Jinx (Marionette & Balloonist): '));
    expect(jinx(scene(chars, { believed: { bo: 'seamstress' } }))).toEqual([]);
    expect(jinx(scene(chars, { believed: { bo: 'balloonist' } }))).toEqual([
      'Jinx (Marionette & Balloonist): the Marionette thinks they are the Balloonist, so an Outsider may be added.',
    ]);
  });
});
