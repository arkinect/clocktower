import { describe, expect, it } from 'vitest';
import { GameState, defaultScript, replay } from '../../src';
import { fuzzGame } from '../helpers/fuzz';
import { assertHidden } from '../helpers/hidden';

describe('fuzzed games with the real roles', () => {
  const script = defaultScript();

  it('never throw, always parse and hide what they should', () => {
    for (let seed = 1; seed <= 400; seed++) {
      let n = 0;
      const { game } = fuzzGame(seed, 200, script, (g) => {
        if (++n % 11 === 0) assertHidden(g);
      });
      expect(GameState.safeParse(game.state).success).toBe(true);
    }
  }, 180_000);

  it('replay byte for byte', () => {
    for (let seed = 1000; seed <= 1030; seed++) {
      const { game } = fuzzGame(seed, 250, script, () => undefined);
      expect(JSON.stringify(replay(game.code, game.createdAt, game.log))).toBe(JSON.stringify(game.state));
    }
  }, 60_000);
});
