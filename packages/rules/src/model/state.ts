// The game model. The zod schema is the single definition: types are inferred from it, snapshots are parsed with it,
// and a CI test hashes it so a state change without an EngineVersion bump fails.
import {
  AbilityId,
  Actions,
  Alignment,
  Choice,
  ConditionId,
  DecisionKey,
  GameId,
  Message,
  PlayerId,
  RoleId,
  RolePreference,
} from '@ct/protocol';
import { z } from 'zod';

/** Bumped by hand when the state schema changes. */
export const ENGINE_VERSION = 2;

const ids = <T extends z.ZodType>(value: T) => z.record(z.string(), value);

export const Moment = z.object({ kind: z.enum(['night', 'day']), n: z.number() });
export type Moment = z.infer<typeof Moment>;

export const Expiry = z.enum(['dusk', 'source_acts_again', 'while_source_works', 'removed', 'event']);
export type Expiry = z.infer<typeof Expiry>;

export const Holder = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), id: PlayerId }),
  z.object({ kind: z.literal('storyteller') }),
  z.object({ kind: z.literal('game') }),
]);
export type Holder = z.infer<typeof Holder>;

export const Origin = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character') }),
  z.object({ kind: z.literal('granted'), by: AbilityId }),
  z.object({ kind: z.literal('storyteller') }),
]);
export type Origin = z.infer<typeof Origin>;

export const AbilityInstance = z.object({
  id: AbilityId,
  roleId: RoleId,
  holder: Holder,
  origin: Origin,
  /** What the holder sees it called; null = hidden. */
  shownAs: RoleId.nullable(),
  /** The holder thinks they have it; it does nothing. */
  perceivedOnly: z.boolean(),
  activeFrom: Moment,
  /** 'removed' means revoked: the instance stays in the table as the source of what it caused. */
  activeUntil: Expiry.nullable(),
  /** Spent, for abilities flagged oncePerGame. */
  used: z.boolean(),
  /** Start information not yet given (gained after night 0). */
  startInfoPending: z.boolean(),
  /** A granted ability that fails whenever the ability that gave it is not working. */
  tiedToSource: z.boolean(),
  /** Keeps working after the holder dies. */
  survivesDeath: z.boolean(),
  /** Typed per role by defineRole. */
  state: z.unknown(),
});
export type AbilityInstance<S = unknown> = Omit<z.infer<typeof AbilityInstance>, 'state'> & { state: S };

export const ConditionType = z.enum(['drunk', 'poisoned', 'protected', 'mad', 'marker']);
export type ConditionType = z.infer<typeof ConditionType>;

export const ConditionSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ability'), id: AbilityId }),
  z.object({ kind: z.literal('storyteller') }),
]);
export type ConditionSource = z.infer<typeof ConditionSource>;

export const Condition = z.object({
  id: ConditionId,
  type: ConditionType,
  name: z.string().optional(),
  data: z.unknown().optional(),
  target: PlayerId,
  source: ConditionSource,
  until: Expiry,
  since: Moment,
});
export type Condition = z.infer<typeof Condition>;

export const CharacterChange = z.object({
  kind: z.literal('character'),
  at: Moment,
  from: RoleId.nullable(),
  to: RoleId.nullable(),
  reason: z.string(),
});
export const AlignmentChange = z.object({
  kind: z.literal('alignment'),
  at: Moment,
  from: Alignment,
  to: Alignment,
  reason: z.string(),
});

export const Player = z.object({
  id: PlayerId,
  name: z.string(),
  rolePreference: RolePreference,
  joinedAt: z.number(),
  hasSeenRole: z.boolean(),
  life: z.object({
    alive: z.boolean(),
    diedAt: Moment.nullable(),
    cause: z.string().nullable(),
    ghostVoteUsed: z.boolean(),
  }),
  removal: z.object({ kind: z.enum(['exiled', 'left']), at: Moment }).nullable(),
  character: RoleId.nullable(),
  alignment: Alignment,
  self: z.object({ character: RoleId.nullable(), alignment: Alignment }),
  history: z.array(z.discriminatedUnion('kind', [CharacterChange, AlignmentChange])),
});
export type Player = z.infer<typeof Player>;

export const Seat = z.object({ playerId: PlayerId, joined: Moment, left: Moment.nullable() });
export type Seat = z.infer<typeof Seat>;

export const Settings = z.object({
  countdownSeconds: z.number(),
  followUpExtensionSeconds: z.number(),
  announceDeaths: z.boolean(),
  notifyOnRoleChange: z.boolean(),
  evilInfoPolicy: z.enum(['house', 'official']),
});
export type Settings = z.infer<typeof Settings>;

export const Submission = z.object({ actions: Actions, at: z.number(), byStoryteller: z.boolean() });
export type Submission = z.infer<typeof Submission>;

export const Answer = z.object({ choice: Choice, byStoryteller: z.boolean(), at: z.number() });
export type Answer = z.infer<typeof Answer>;

export const Phase = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lobby') }),
  z.object({ kind: z.literal('setup') }),
  z.object({
    kind: z.literal('night'),
    n: z.number(),
    stage: z.enum(['briefing', 'collecting', 'review']),
    /** Advisory only: nothing closes on a timer. */
    deadline: z.number().nullable(),
    seed: z.number(),
    submissions: ids(Submission),
    decisions: ids(z.object({ key: DecisionKey, option: z.string() })),
    overrides: ids(z.object({ lines: z.array(z.string()), writtenAgainst: z.array(z.string()) })),
    answers: ids(Answer),
    malfunctionAdjust: z.object({ add: z.array(PlayerId), remove: z.array(PlayerId) }),
    /** The deadline has had its one extension for follow-up questions. */
    followUpsExtended: z.boolean(),
  }),
  z.object({ kind: z.literal('day'), n: z.number() }),
  z.object({
    kind: z.literal('ended'),
    reason: z.enum(['storyteller', 'update']),
    winner: Alignment.nullable(),
  }),
]);
export type Phase = z.infer<typeof Phase>;
export type NightPhase = Extract<Phase, { kind: 'night' }>;
export type DayPhase = Extract<Phase, { kind: 'day' }>;

const At = { at: Moment };

export const StoryRow = z.object({
  playerId: PlayerId,
  name: z.string(),
  character: RoleId.nullable(),
  believed: RoleId.nullable(),
  alignment: Alignment,
  aliveAtStart: z.boolean(),
  aliveAtEnd: z.boolean(),
  impaired: z.boolean(),
  causes: z.array(z.string()),
  actions: z.array(z.object({ slot: z.string(), input: z.string(), outcome: z.string() })),
  received: z.array(z.object({ title: z.string(), lines: z.array(z.string()), truth: z.array(z.string()).nullable() })),
});
export type StoryRow = z.infer<typeof StoryRow>;

export const GameEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('nomination'), ...At, nominator: PlayerId.nullable(), nominee: PlayerId }),
  z.object({
    kind: z.literal('vote'),
    ...At,
    nominee: PlayerId,
    count: z.number().nullable(),
    voters: z.array(PlayerId).nullable(),
  }),
  z.object({ kind: z.literal('execution'), ...At, playerId: PlayerId.nullable(), died: z.boolean() }),
  z.object({ kind: z.literal('exile'), ...At, playerId: PlayerId }),
  z.object({ kind: z.literal('statement'), ...At, playerId: PlayerId, text: z.string() }),
  z.object({ kind: z.literal('death'), ...At, playerId: PlayerId, cause: z.string() }),
  z.object({ kind: z.literal('revival'), ...At, playerId: PlayerId }),
  z.object({ kind: z.literal('broke_madness'), ...At, playerId: PlayerId, ruling: z.string() }),
  z.object({ kind: z.literal('malfunction'), ...At, playerId: PlayerId, cause: z.string(), detail: z.string() }),
  z.object({ kind: z.literal('note'), ...At, text: z.string() }),
  z.object({
    kind: z.literal('night_record'),
    ...At,
    rows: z.array(StoryRow),
    deaths: z.array(PlayerId),
    revived: z.array(PlayerId),
  }),
]);
export type GameEvent = z.infer<typeof GameEvent>;

export const Prompt = z.object({
  id: z.string(),
  ability: AbilityId,
  kind: z.string(),
  subject: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type Prompt = z.infer<typeof Prompt>;

export const GameEndCandidate = z.object({ key: z.string(), winner: Alignment.nullable(), reason: z.string() });
export type GameEndCandidate = z.infer<typeof GameEndCandidate>;

export const PendingNotice = z.object({ playerId: PlayerId, title: z.string(), lines: z.array(z.string()) });

export const GameState = z.object({
  version: z.number(),
  id: GameId,
  code: z.string(),
  createdAt: z.number(),
  seq: z.number(),
  idSeq: z.number(),
  phase: Phase,
  players: ids(Player),
  storytellerId: PlayerId.nullable(),
  seats: z.array(Seat),
  seatingPublished: z.boolean(),
  publishedSeating: z.array(PlayerId),
  script: z.array(RoleId),
  /** Fabled and Loric in play; Loric are fixed at setup. */
  storytellerCharacters: z.array(RoleId),
  abilities: ids(AbilityInstance),
  conditions: z.array(Condition),
  setup: z.object({
    bluffs: z.array(RoleId),
    /** The token a player drew, when it differs from their character. */
    bag: ids(RoleId),
    rules: z.object({ countsOverride: z.array(z.number()).nullable() }),
  }),
  events: z.array(GameEvent),
  inbox: ids(z.array(Message)),
  /** Delivered when the next night starts. */
  pendingNotices: z.array(PendingNotice),
  prompts: z.array(Prompt),
  gameEnd: z.array(GameEndCandidate),
  dismissedGameEnd: z.array(z.string()),
  publicDead: z.array(PlayerId),
  settings: Settings,
});
export type GameState = Omit<z.infer<typeof GameState>, 'abilities'> & { abilities: Record<string, AbilityInstance> };

export const SETUP_MOMENT: Moment = { kind: 'night', n: -1 };

export const DEFAULT_SETTINGS: Settings = {
  countdownSeconds: 300,
  followUpExtensionSeconds: 120,
  announceDeaths: false,
  notifyOnRoleChange: true,
  evilInfoPolicy: 'house',
};

/** Time order: night 0, day 1, night 1, day 2, night 2... */
export const momentOrder = (m: Moment): number => (m.kind === 'night' ? 2 * m.n : 2 * m.n - 1);

export function phaseMoment(s: { phase: Phase; events: GameEvent[] }): Moment {
  const p = s.phase;
  if (p.kind === 'night') return { kind: 'night', n: p.n };
  if (p.kind === 'day') return { kind: 'day', n: p.n };
  if (p.kind === 'ended') {
    const last = [...s.events].reverse()[0];
    return last ? last.at : SETUP_MOMENT;
  }
  return SETUP_MOMENT;
}
