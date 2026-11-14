import { describe, expect, it } from 'vitest';
import { GameState, defaultScript, replay, resolveNight, type GameStateT } from '../../src';
import { fuzzGame } from '../helpers/fuzz';
import { assertHidden } from '../helpers/hidden';

declare const __FUZZ_GAMES__: number;

describe('fuzzed games with the real roles', () => {
  const script = defaultScript();

  it(`${__FUZZ_GAMES__} games never throw, always parse and hide what they should`, () => {
    for (let seed = 1; seed <= __FUZZ_GAMES__; seed++) {
      let n = 0;
      const { game } = fuzzGame(seed, 200, script, (g) => {
        if (++n % 11 === 0) assertHidden(g);
      });
      expect(GameState.safeParse(game.state).success).toBe(true);
    }
  }, 3_000_000);

  it('a resolved night changes only what dawn carries over', () => {
    // publish() in phases/night.ts copies these from the resolved night, and sends results and notices itself.
    // Anything else a night hook writes (a message straight to the inbox, a pending notice, the published seating,
    // a prompt, an event) would be lost without a word. A role that needs one of those at night fails here first.
    const carried = new Set(['players', 'abilities', 'conditions', 'seats', 'setup', 'idSeq']);
    for (let seed = 2000; seed < 2040; seed++) {
      fuzzGame(seed, 200, script, (g) => {
        if (g.state.phase.kind !== 'night') return;
        // A copy, so the night is resolved from this very state and not answered from an earlier one's memo.
        const state = structuredClone(g.state);
        const after = resolveNight(state).after;
        for (const key of Object.keys(state) as (keyof GameStateT)[]) {
          if (!carried.has(key)) expect(after[key], `the night wrote to ${key}`).toEqual(state[key]);
        }
      });
    }
  }, 120_000);

  it('replay byte for byte', () => {
    for (let seed = 1000; seed <= 1030; seed++) {
      const { game } = fuzzGame(seed, 250, script, () => undefined);
      expect(JSON.stringify(replay(game.code, game.createdAt, game.log))).toBe(JSON.stringify(game.state));
    }
  }, 60_000);
});
