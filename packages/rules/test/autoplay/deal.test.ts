// The complete deal: legal for every size of table, at the odds written down, and refused only for public reasons.
import { describe, expect, it } from 'vitest';
import { roleId } from '@ct/protocol';
import { deal, findRole } from '../../src';
import { actualCounts, setupChecklist, setupWarnings, targetCounts } from '../../src/setup/rules';
import { autoScript, table, type AutoGame } from '../helpers/autoplay';
import { pid } from '../helpers/game';

const deals = (g: AutoGame, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const s = deal(g.state, i * 7919 + 1);
    if (!s) throw new Error('no deal');
    return s;
  });
const inPlay = (s: AutoGame['state']) => [...s.players.values()].map((p) => p.character as string);

describe('the deal', () => {
  it('is complete and legal for every number of players', () => {
    for (let n = 5; n <= 15; n++) {
      for (const s of deals(table(n), 15)) {
        const label = `${n} players`;
        const roles = inPlay(s).map((x) => roleId(x));
        expect(
          setupChecklist(s).filter((c) => !c.done),
          label,
        ).toEqual([]);
        expect(setupWarnings(s), label).toEqual([]);
        expect(actualCounts(s), label).toEqual(targetCounts(s, n, roles).counts);
      }
    }
  }, 60_000);

  it('draws the characters evenly, whoever asked for what', () => {
    // With an Outsider in the chart: the Vigormortis takes one away.
    const g = table(8);
    const seen = new Map<string, number>();
    for (const s of deals(g, 600)) {
      const demon = inPlay(s).find((r) => findRole(r as never)?.type === 'demon') as string;
      seen.set(demon, (seen.get(demon) ?? 0) + 1);
    }
    const demons = autoScript().filter((r) => findRole(r)?.type === 'demon');
    expect(seen.size).toBe(demons.length);
    for (const d of demons) expect(seen.get(d)).toBeGreaterThan(600 / demons.length / 2);
  });

  it('gives a character twice as often to a player who asked for its type', () => {
    const script = autoScript().filter((r) => !['lil_monsta', 'marionette'].includes(r));
    const g = table(7, script);
    const ann = g.player(pid('n3'));
    g.state = { ...g.state, players: new Map(g.state.players).set(ann.id, { ...ann, rolePreference: 'demon' }) };
    const demons = deals(g, 1500).filter(
      (s) => findRole(s.players.get(ann.id)?.character as never)?.type === 'demon',
    ).length;
    // 2 in 8, against 1 in 7.
    expect(demons / 1500).toBeGreaterThan(0.215);
    expect(demons / 1500).toBeLessThan(0.285);
  });

  it('starts from the steward’s counts, and lets characters change them', () => {
    const g = table(10);
    g.sw({ type: 'steward_counts', counts: [6, 1, 2, 1] });
    for (const s of deals(g, 60)) {
      expect(setupChecklist(s).every((c) => c.done)).toBe(true);
      if (
        inPlay(s).includes('baron') &&
        !inPlay(s).some((r) => ['balloonist', 'godfather', 'huntsman', 'vigormortis'].includes(r))
      ) {
        expect(actualCounts(s)).toEqual([4, 3, 2, 1]);
      }
    }
    expect(g.rejected(g.steward, { type: 'steward_counts', counts: [7, 1, 2, 0] })).toBe('There must be 1 Demon.');
    expect(g.rejected(g.steward, { type: 'steward_counts', counts: [6, 1, 1, 1] })).toMatch(/add up/);
  });

  it('draws the Balloonist’s and the Godfather’s Outsiders either way', () => {
    const script = autoScript();
    const outsiders = (role: string, field: string) => {
      const out = new Set<string>();
      for (const s of deals(table(9, script), 800)) {
        const a = [...s.abilities.values()].find((x) => x.roleId === role && !x.perceivedOnly);
        const holder = a?.holder.kind === 'player' ? s.players.get(a.holder.id) : null;
        if (holder?.character !== role) continue;
        out.add((a?.state as { setup: Record<string, string> }).setup[field] as string);
      }
      return [...out].sort();
    };
    expect(outsiders('balloonist', 'outsiders')).toEqual(['+0', '+1']);
    expect(outsiders('godfather', 'outsiders')).toEqual(['+1', '-1']);
  });

  it('draws the red herring from every good player, the Fortune Teller and the Drunk too', () => {
    const kinds = new Set<string>();
    for (const s of deals(table(8), 1500)) {
      const ft = [...s.abilities.values()].find((a) => a.roleId === 'fortune_teller');
      const herring = (ft?.state as { setup?: { herring?: string } } | undefined)?.setup?.herring;
      if (herring) kinds.add(s.players.get(herring as never)?.character as string);
    }
    expect(kinds).toContain('fortune_teller');
    expect(kinds).toContain('drunk');
  });

  it('draws the bluffs evenly, not Townsfolk only', () => {
    const types = new Set<string>();
    for (const s of deals(table(8), 60)) for (const b of s.setup.bluffs) types.add(findRole(b)?.type as string);
    expect([...types].sort()).toEqual(['outsider', 'townsfolk']);
  });

  it('is refused by a script that is too short, in words about the script', () => {
    const g = table(
      8,
      autoScript().filter((r) => findRole(r)?.type !== 'outsider'),
    );
    expect(g.console().setup.fit).toEqual(['Not enough Outsiders: 0 on the script, 1 needed.']);
    expect(g.rejected(g.steward, { type: 'deal' })).toBe('Not enough Outsiders: 0 on the script, 1 needed.');
    expect(table(4).rejected(pid('n0'), { type: 'deal' })).toBe('Autoplay needs 5 to 15 players.');
  });

  it('cannot be done again', () => {
    const g = table(7);
    g.sw({ type: 'deal' });
    expect(g.rejected(g.steward, { type: 'deal' })).toBe('You cannot do that right now.');
    expect(g.console().seenRole).toEqual({ seen: 0, of: 7 });
  });
});
