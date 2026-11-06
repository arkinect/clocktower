// The night-engine rules fixes, one describe per fix: each is checked against the official wiki (design.md section 19).
import { describe, expect, it } from 'vitest';
import { ROLE_BY_ID } from '@ct/shared';
import { makeRng } from '../src/engine/rng';
import { enabledRoles, suggestDistribution, targetCounts } from '../src/engine/setup';
import { minionIds, demonIds, typeOf } from '../src/engine/world';
import { build, publishAndDay, resolve, type TestGame } from './helpers';


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
