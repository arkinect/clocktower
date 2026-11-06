// dispatch(state, actor, command, { now, seed }): validate the schema, check actor and phase, run the handler on an
// immer draft. Replaying the entries it returns reproduces the state byte for byte.
import { produce } from 'immer';
import { Command, type PlayerId } from '@ct/protocol';
import { buildCtx, Rejected, type CommandDef } from './phases/define';
import { lobbyCommands } from './phases/lobby';
import { setupCommands } from './phases/setup';
import { nightCommands } from './phases/night';
import { dayCommands } from './phases/day';
import { createGame } from './model/create';
import type { GameState } from './model/state';
import { carryResolution } from './night/wake';

const registry = new Map<string, CommandDef>(
  [...lobbyCommands, ...setupCommands, ...nightCommands, ...dayCommands].map((c) => [c.type, c]),
);

export interface Inputs {
  now: number;
  seed: number;
}

export interface LogEntry extends Inputs {
  actor: PlayerId | null;
  command: Command;
}

export type DispatchResult =
  | { ok: true; state: GameState; entry: LogEntry; data: unknown; resolutionChanged: boolean }
  | { ok: false; error: string; internal?: true };

export function dispatch(state: GameState, actor: PlayerId | null, input: unknown, inputs: Inputs): DispatchResult {
  const parsed = Command.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Bad request.' };
  const command = parsed.data;
  const def = registry.get(command.type);
  if (!def) return { ok: false, error: 'Unknown request.' };

  if (def.by === 'system') {
    if (actor !== null) return { ok: false, error: 'You cannot do that.' };
  } else {
    if (actor === null || !state.players[actor]) return { ok: false, error: 'Unknown player.' };
    if (def.by === 'storyteller' && state.storytellerId !== actor) {
      return { ok: false, error: 'Only the Storyteller can do that.' };
    }
  }
  if (!def.phases.includes(state.phase.kind)) return { ok: false, error: 'You cannot do that right now.' };

  const out = { data: undefined as unknown, keep: false };
  try {
    const next = produce(state, (draft) => {
      const s = draft as GameState;
      def.handle(buildCtx(s, state, actor, inputs.now, inputs.seed, out), command);
      s.seq += 1;
    });
    if (out.keep) carryResolution(state, next);
    return {
      ok: true,
      state: next,
      entry: { actor, command, now: inputs.now, seed: inputs.seed },
      data: out.data,
      resolutionChanged: !out.keep,
    };
  } catch (e) {
    if (e instanceof Rejected) return { ok: false, error: e.message };
    return { ok: false, error: `Internal error: ${(e as Error).message}`, internal: true };
  }
}

/** Rebuilds a game from its command log. */
export function replay(code: string, createdAt: number, log: readonly LogEntry[]): GameState {
  let state = createGame(code, createdAt);
  for (const e of log) {
    const res = dispatch(state, e.actor, e.command, { now: e.now, seed: e.seed });
    if (!res.ok) throw new Error(`Replay failed: ${res.error}`);
    state = res.state;
  }
  return state;
}
