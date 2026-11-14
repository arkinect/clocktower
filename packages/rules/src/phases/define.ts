// The command registry. Each command declares who may send it and in which phases; the dispatcher enforces both before
// the handler runs, so no handler guards its own phase.
import type { CommandOf, CommandType, Decisions, PlayerId } from '@ct/protocol';
import { hashDecision, Run } from '../night/run';
import { Reader } from '../derive/reader';
import type { GameState, Moment, Phase } from '../model/state';
import { phaseMoment } from '../model/state';
import { makeRng, type Rng } from '../util/rng';

export class Rejected extends Error {}

/** Rejects the command with a message the sender sees. */
export function need(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Rejected(message);
}

type Kind = Phase['kind'];

export interface CmdCtx<P extends Kind> {
  /** The immer draft. */
  s: GameState;
  /** The state before this command, frozen. */
  base: GameState;
  phase: Extract<Phase, { kind: P }>;
  actor: PlayerId | null;
  now: number;
  seed: number;
  rng: Rng;
  r: Reader;
  moment: Moment;
  /** A pass of the engine on the draft, for commands that fire hooks. */
  run(options?: { moment?: Moment; decisions?: Decisions; world?: GameState }): Run;
  /** Returned to the sender. */
  reply(data: unknown): void;
  /** Keep the night's computed resolution; nothing this command did can change it. */
  keepResolution(): void;
}

export interface CommandDef<T extends CommandType = CommandType, P extends Kind = Kind> {
  type: T;
  by: 'player' | 'storyteller' | 'any' | 'system';
  phases: readonly P[];
  handle(ctx: CmdCtx<P>, cmd: CommandOf<T>): void;
}

export const ALL_PHASES = ['lobby', 'setup', 'night', 'day', 'ended'] as const;
export const LIVE_PHASES = ['setup', 'night', 'day'] as const;

export function defineCommand<T extends CommandType, P extends Kind>(def: CommandDef<T, P>): CommandDef {
  // Registered commands are looked up by their own `type`, so a handler only ever sees its own command and phases.
  return def as unknown as CommandDef;
}

export function buildCtx(
  s: GameState,
  base: GameState,
  actor: PlayerId | null,
  now: number,
  seed: number,
  state: { data: unknown; keep: boolean },
): CmdCtx<Kind> {
  const moment = phaseMoment(s);
  return {
    s,
    base,
    phase: s.phase,
    actor,
    now,
    seed,
    rng: makeRng(seed),
    r: new Reader(s, moment),
    moment,
    run(options = {}) {
      const at = options.moment ?? phaseMoment(s);
      const decisions: Record<string, string> = {};
      for (const d of options.decisions ?? []) decisions[hashDecision(at.n, d.key)] = d.option;
      return new Run({ world: options.world ?? s, moment: at, seed, now, dayDecisions: decisions });
    },
    reply(data) {
      state.data = data;
    },
    keepResolution() {
      state.keep = true;
    },
  };
}
