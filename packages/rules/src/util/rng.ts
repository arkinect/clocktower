// Seeded RNG (mulberry32). Every random recommendation goes through this, so resolution is deterministic.
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  coin(): boolean;
  shuffle<T>(items: readonly T[]): T[];
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: <T>(items: readonly T[]) => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[int(items.length)] as T;
    },
    coin: () => next() < 0.5,
    shuffle: <T>(items: readonly T[]) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const x = out[i] as T;
        out[i] = out[j] as T;
        out[j] = x;
      }
      return out;
    },
  };
}

/** A stable sub-stream, so each decision has its own randomness regardless of evaluation order. */
export function subRng(seed: number, key: string): Rng {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return makeRng(h >>> 0);
}
