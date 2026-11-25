// Random commands in a Storyteller's game. Nothing may throw, no phone may learn what it should not, and a saved or
// replayed game must be the same game.
import { describe, expect, it } from 'vitest';
import { Command, type RoleId } from '@ct/protocol';
import { defaultScript, loadState, replay, saveState, resolveNight, type GameStateT } from '../../src';
import { autoplayCommands } from '../../src/phases/autoplay';
import { CARRIED, eachSeed, FUZZ_GAMES, fuzzGame } from '../helpers/fuzz';
import type { TestGame } from '../helpers/game';
import { assertHidden } from '../helpers/hidden';
import { PLAIN_SCRIPT } from '../helpers/plain';

function play(seed: number, steps: number, script: readonly RoleId[], check: (g: TestGame) => void = () => undefined) {
  let n = 0;
  const { game } = fuzzGame(seed, steps, script, (g) => {
    if (++n % 11 === 0) assertHidden(g);
    check(g);
  });
  const saved = saveState(game.state);
  expect(loadState(saved).state).toEqual(game.state);
  expect(saveState(replay(game.code, game.createdAt, game.log)), 'the replay').toBe(saved);
}

describe('fuzzed games', () => {
  const script = defaultScript();

  it(
    `${FUZZ_GAMES} with the real roles`,
    () => {
      eachSeed(FUZZ_GAMES, (seed) => play(seed, 200, script));
    },
    60_000 + FUZZ_GAMES * 2000,
  );

  it('with characters that have no ability, through every phase', () => {
    const reached = new Set<string>();
    eachSeed(
      30,
      (seed) =>
        play(seed, 120, PLAIN_SCRIPT, (g) => {
          const p = g.state.phase;
          reached.add(p.kind === 'day' && p.n > 1 ? 'later day' : p.kind);
        }),
      1,
    );
    expect([...reached].sort()).toEqual(['day', 'ended', 'later day', 'lobby', 'night', 'setup']);
  }, 60_000);

  it('use every command, and a resolved night changes only what dawn carries over', () => {
    // publish() in phases/night.ts copies these from the resolved night, and sends results and notices itself.
    // Anything else a night hook writes (a message straight to the inbox, a pending notice, the published seating,
    // a prompt, an event) would be lost without a word. A role that needs one of those at night fails here first.
    const carried = new Set<string>(CARRIED);
    const used = new Set<string>();
    let n = 0;
    eachSeed(
      40,
      (seed) =>
        fuzzGame(seed, 200, script, (g, command) => {
          used.add(command.type);
          if (g.state.phase.kind !== 'night' || ++n % 3) return;
          // A copy, so the night is resolved from this very state and not answered from an earlier one's memo.
          const state = structuredClone(g.state);
          const after = resolveNight(state).after;
          for (const key of Object.keys(state) as (keyof GameStateT)[]) {
            if (!carried.has(key)) expect(after[key], `the night wrote to ${key}`).toEqual(state[key]);
          }
        }),
      2000,
    );
    // Autoplay's commands are played in autoplay-games.test.ts, and no role in the app asks by prompt yet.
    const elsewhere = new Set<string>([...autoplayCommands.map((c) => c.type), 'resolve_prompt']);
    const all = Command.options.map((o) => o.shape.type.value);
    expect(all.filter((type) => !elsewhere.has(type) && !used.has(type))).toEqual([]);
  }, 120_000);
});
