import { describe, expect, it } from 'vitest';
import { Pair, type Difference } from './runner';

declare const __FUZZ_GAMES__: number;

function summarise(diffs: Difference[]) {
  const groups = new Map<string, Difference[]>();
  for (const d of diffs) {
    const key = d.what.replace(/p\d+/g, 'p').replace(/:[a-z_]+$/, '');
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, list]) => {
      const first = list[0] as Difference;
      return `${list.length} x ${key}\n   seed ${first.seed} ${first.at}\n   ${first.what}\n   old  ${JSON.stringify(first.old)}\n   new  ${JSON.stringify(first.next)}`;
    });
}

describe('parity with the old engine', () => {
  it(`${__FUZZ_GAMES__} fuzzed games`, () => {
    const diffs: Difference[] = [];
    let errors = 0;
    const totals = { checks: 0, nights: 0, decided: 0, answered: 0, deaths: 0, lines: 0 };
    const samples: string[] = [];
    for (let seed = 1; seed <= __FUZZ_GAMES__; seed++) {
      const pair = new Pair(seed);
      try {
        pair.play();
      } catch (e) {
        errors += 1;
        if (samples.length < 8) samples.push(`seed ${seed}: ${(e as Error).message}`);
      }
      // One difference usually causes many after it, so each game reports its first.
      diffs.push(...pair.diffs.slice(0, 1));
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += pair[k];
    }
    expect(totals.checks).toBeGreaterThan(__FUZZ_GAMES__ * 100);
    expect({ errors, samples, differences: summarise(diffs) }).toEqual({ errors: 0, samples: [], differences: [] });
  }, 3_000_000);
});
