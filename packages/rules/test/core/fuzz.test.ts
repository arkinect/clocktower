import { describe, expect, it } from 'vitest';
import { GameState, replay } from '../../src';
import { assertHidden } from '../helpers/hidden';
import { fuzzGame, seatedIds } from '../helpers/fuzz';
import { PLAIN_SCRIPT } from '../helpers/plain';

describe('fuzz', () => {
  const games = 1000;

  it(`${games} random command sequences never throw and hide what they should`, () => {
    let accepted = 0;
    const reached = new Set<string>();
    for (let seed = 1; seed <= games; seed++) {
      const { game } = fuzzGame(seed, 120, PLAIN_SCRIPT, (g) => {
        accepted += 1;
        const p = g.state.phase;
        reached.add(p.kind === 'day' && p.n > 1 ? 'later day' : p.kind);
        if (accepted % 7 === 0) assertHidden(g);
      });
      expect(GameState.safeParse(game.state).success).toBe(true);
      expect(seatedIds(game.state).length).toBeLessThanOrEqual(15);
    }
    expect(accepted).toBeGreaterThan(games * 40);
    expect([...reached].sort()).toEqual(['day', 'ended', 'later day', 'lobby', 'night', 'setup']);
  }, 120_000);

  it('replaying the command log reproduces the state byte for byte', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { game } = fuzzGame(seed, 200, PLAIN_SCRIPT, () => undefined);
      expect(JSON.stringify(replay(game.code, game.createdAt, game.log))).toBe(JSON.stringify(game.state));
    }
  });
});
