import { z } from 'zod';
import { ActionSpec, Choice, DayActionSpec, DecisionKey } from './actions';
import { AbilityId, Alignment, CharacterType, ConditionId, PlayerId, RoleId, RolePreference } from './ids';

export const RoleCard = z.object({
  roleId: RoleId,
  name: z.string(),
  type: CharacterType,
  abilityText: z.string(),
  reminder: z.string().nullable(),
  firstNight: z.number().nullable(),
  otherNight: z.number().nullable(),
  /** Made for this app: other Clocktower tools do not know its id. */
  homebrew: z.boolean(),
  /** Why an autoplay script cannot have it. Absent when it can. */
  notInAutoplay: z.string().optional(),
});
export type RoleCard = z.infer<typeof RoleCard>;

export const PhaseView = z.object({
  kind: z.enum(['lobby', 'setup', 'night', 'day', 'ended']),
  n: z.number(),
  stage: z.enum(['briefing', 'collecting', 'review']).nullable(),
  deadline: z.number().nullable(),
  winner: Alignment.nullable(),
  endedReason: z.enum(['storyteller', 'update', 'steward']).nullable(),
});
export type PhaseView = z.infer<typeof PhaseView>;

export const Message = z.object({
  id: z.string(),
  n: z.number(),
  kind: z.enum(['starting', 'result', 'notice']),
  title: z.string(),
  lines: z.array(z.string()),
});
export type Message = z.infer<typeof Message>;

export const PublicPlayer = z.object({
  id: PlayerId,
  name: z.string(),
  seat: z.number().nullable(),
  isStoryteller: z.boolean(),
  /** A Traveller's character is public. */
  publicRole: RoleId.nullable(),
  exiled: z.boolean(),
});
export type PublicPlayer = z.infer<typeof PublicPlayer>;

/** A question an ability asks its holder by day, in private. */
export const DayPrompt = ActionSpec.extend({
  /** What they have answered today, one value per field. */
  recorded: z.array(z.string()).nullable(),
});
export type DayPrompt = z.infer<typeof DayPrompt>;

export const PlayerView = z.object({
  kind: z.literal('player'),
  code: z.string(),
  phase: PhaseView,
  serverNow: z.number(),
  me: z.object({
    id: PlayerId,
    name: z.string(),
    alive: z.boolean(),
    seated: z.boolean(),
    hasSeenRole: z.boolean(),
    ghostVoteUsed: z.boolean(),
    role: RoleCard.nullable(),
    submitted: z.boolean(),
    submission: z.record(z.string(), Choice).nullable(),
    actions: z.array(ActionSpec),
    questions: z.array(ActionSpec),
    messages: z.array(Message),
    /** Grimoire data this player may see through an ability they hold. */
    grants: z.array(z.object({ title: z.string(), lines: z.array(z.string()) })),
    /** Autoplay only. */
    dayPrompts: z.array(DayPrompt).optional(),
    /** Autoplay only: a rule of their own character that nobody else will hold them to. */
    reminder: z.string().optional(),
    /** Autoplay only: the steward asks them to stop playing and be the Storyteller. */
    offeredStoryteller: z.boolean().optional(),
  }),
  players: z.array(PublicPlayer),
  seatingPublished: z.boolean(),
  /** Players shown as dead on this phone: a snapshot taken each dawn. */
  deadAtDawn: z.array(PlayerId),
  announcedDeaths: z.array(PlayerId).nullable(),
  script: z.array(RoleId),
  hasStoryteller: z.boolean(),
  /** In autoplay, who runs it. */
  steward: PlayerId.optional(),
  /** Standing news for everyone, such as a player becoming the Storyteller. */
  tableNotes: z.array(z.string()).optional(),
});
export type PlayerView = z.infer<typeof PlayerView>;

export const AbilityView = z.object({
  id: AbilityId,
  roleId: RoleId,
  name: z.string(),
  shownAs: RoleId.nullable(),
  origin: z.enum(['character', 'granted', 'storyteller']),
  perceivedOnly: z.boolean(),
  used: z.boolean(),
  active: z.boolean(),
  oncePerGame: z.boolean(),
  usageAuto: z.boolean(),
  reminder: z.string().nullable(),
  /** The reminder matters by day: the Day tab lists it under Execution. */
  dayReminder: z.boolean(),
  /** When it started: "Night 2", "Day 3". */
  from: z.string(),
  /** Kept when the holder dies. */
  survivesDeath: z.boolean(),
  summary: z.array(z.string()),
});
export type AbilityView = z.infer<typeof AbilityView>;

export const ConditionView = z.object({
  id: ConditionId,
  type: z.enum(['drunk', 'poisoned', 'protected', 'mad', 'marker']),
  name: z.string().nullable(),
  label: z.string(),
  until: z.string(),
  sourceLabel: z.string(),
});
export type ConditionView = z.infer<typeof ConditionView>;

export const GrimoirePlayer = z.object({
  id: PlayerId,
  name: z.string(),
  seat: z.number().nullable(),
  alive: z.boolean(),
  deathCause: z.string().nullable(),
  character: RoleId.nullable(),
  alignment: Alignment,
  self: z.object({ character: RoleId.nullable(), alignment: Alignment }),
  abilities: z.array(AbilityView),
  conditions: z.array(ConditionView),
  impaired: z.boolean(),
  causes: z.array(z.string()),
  ghostVoteUsed: z.boolean(),
  hasSeenRole: z.boolean(),
  rolePreference: RolePreference,
  connected: z.boolean(),
  departed: z.boolean(),
  isDemon: z.boolean(),
});
export type GrimoirePlayer = z.infer<typeof GrimoirePlayer>;

export const SetupFieldSpec = z.object({
  abilityId: AbilityId,
  field: z.string(),
  title: z.string(),
  kind: z.enum(['player', 'role', 'option', 'text']),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  value: z.string().nullable(),
  suggestible: z.boolean(),
  /** Shown in this player's row under Characters, as "<name> <label>", instead of with the other fields. */
  row: z.object({ playerId: PlayerId, label: z.string() }).optional(),
});
export type SetupFieldSpec = z.infer<typeof SetupFieldSpec>;

export const CheckItem = z.object({ id: z.string(), label: z.string(), done: z.boolean(), blocking: z.boolean() });
export type CheckItem = z.infer<typeof CheckItem>;

const Counts = z.array(z.number());

export const SetupView = z.object({
  checklist: z.array(CheckItem),
  warnings: z.array(z.string()),
  counts: z.object({ target: Counts, actual: Counts, source: z.enum(['default', 'override']) }),
  bluffs: z.array(RoleId),
  bluffCandidates: z.array(RoleId),
  fields: z.array(SetupFieldSpec),
  believedOptions: z.record(z.string(), z.array(RoleId)),
  storytellerCharacters: z.array(RoleId),
});
export type SetupView = z.infer<typeof SetupView>;

export const ReviewItem = z.object({
  key: DecisionKey,
  hash: z.string(),
  title: z.string(),
  description: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  default: z.string(),
  chosen: z.string().nullable(),
  /** Publish dawn waits for an answer (or force). The default is never taken for it. */
  required: z.boolean(),
});
export type ReviewItem = z.infer<typeof ReviewItem>;

export const ResultView = z.object({
  key: z.string(),
  playerId: PlayerId,
  roleId: RoleId,
  title: z.string(),
  truth: z.array(z.string()),
  suggested: z.array(z.string()),
  /** Set when a transformInfo hook changed the suggestion. */
  transformed: z.array(z.string()).nullable(),
  final: z.array(z.string()),
  impaired: z.boolean(),
  causes: z.array(z.string()),
  overridden: z.boolean(),
  staleOverride: z.boolean(),
  alternatives: z.array(z.array(z.string())),
  /** Only confirms a choice: it has no false version, so Review has nothing to ask about it. */
  confirmation: z.boolean(),
});
export type ResultView = z.infer<typeof ResultView>;

export const QuestionView = z.object({
  key: z.string(),
  playerId: PlayerId,
  roleId: RoleId,
  spec: ActionSpec,
  answered: z.boolean(),
  answer: Choice.nullable(),
});
export type QuestionView = z.infer<typeof QuestionView>;

export const Malfunction = z.object({ playerId: PlayerId, cause: z.string(), detail: z.string() });
export type Malfunction = z.infer<typeof Malfunction>;

export const ActorRow = z.object({
  slot: z.string(),
  /** Null for an ability the Storyteller holds. */
  playerId: PlayerId.nullable(),
  roleId: RoleId,
  input: z.string(),
  impaired: z.boolean(),
  causes: z.array(z.string()),
  outcome: z.string(),
});
export type ActorRow = z.infer<typeof ActorRow>;

export const GameEndSuggestion = z.object({
  key: z.string(),
  winner: Alignment.nullable(),
  reason: z.string(),
});
export type GameEndSuggestion = z.infer<typeof GameEndSuggestion>;

/** A night as a table: one row per seated player, in seat order. */
export const StoryNight = z.object({
  kind: z.literal('night'),
  n: z.number(),
  deaths: z.array(PlayerId),
  revived: z.array(PlayerId),
  rows: z.array(
    z.object({
      playerId: PlayerId,
      /** 0-based position in the night's rows. */
      seat: z.number(),
      name: z.string(),
      character: RoleId.nullable(),
      believed: RoleId.nullable(),
      alignment: Alignment,
      aliveAtStart: z.boolean(),
      aliveAtEnd: z.boolean(),
      causes: z.array(z.string()),
      /** `roleId` is null when only the slot was stored: print the slot then. */
      actions: z.array(
        z.object({ roleId: RoleId.nullable(), slot: z.string(), input: z.string(), outcome: z.string() }),
      ),
      received: z.array(
        z.object({ title: z.string(), lines: z.array(z.string()), truth: z.array(z.string()).nullable() }),
      ),
    }),
  ),
});
export type StoryNight = z.infer<typeof StoryNight>;

export const ReviewView = z.object({
  actors: z.array(ActorRow),
  results: z.array(ResultView),
  decisions: z.array(ReviewItem),
  questions: z.array(QuestionView),
  notices: z.array(z.object({ playerId: PlayerId, title: z.string(), lines: z.array(z.string()) })),
  deaths: z.array(PlayerId),
  revived: z.array(PlayerId),
  malfunctions: z.array(Malfunction),
  malfunctionAdjust: z.object({ add: z.array(PlayerId), remove: z.array(PlayerId) }),
  gameEnd: z.array(GameEndSuggestion),
  log: z.array(z.string()),
  /** Tonight as the Story tab will show it once published. */
  story: StoryNight,
  /** The day's recorded facts that tonight reads, which `record_fact` records again. */
  facts: z.array(DayActionSpec).default([]),
});
export type ReviewView = z.infer<typeof ReviewView>;

export const SubmissionRow = z.object({
  playerId: PlayerId,
  wakes: z.array(z.object({ roleId: RoleId, title: z.string() })),
  specs: z.array(ActionSpec),
  expected: z.boolean(),
  submitted: z.boolean(),
  byStoryteller: z.boolean(),
  submission: z.record(z.string(), Choice).nullable(),
});
export type SubmissionRow = z.infer<typeof SubmissionRow>;

export const DayEventView = z.object({
  at: z.string(),
  kind: z.string(),
  text: z.string(),
  /** The player the event is about, when there is one (the executee, for an execution). */
  playerId: PlayerId.nullable(),
});
export type DayEventView = z.infer<typeof DayEventView>;

export const PromptView = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type PromptView = z.infer<typeof PromptView>;

/** A day as a few labelled lines. */
export const StoryDay = z.object({
  kind: z.literal('day'),
  n: z.number(),
  /** The day's final execution record; null when none was recorded. */
  execution: z.object({ playerId: PlayerId.nullable(), died: z.boolean() }).nullable(),
  deaths: z.array(z.object({ playerId: PlayerId, cause: z.string() })),
  /** Exile, revival, broke madness, and nomination, vote and statement lines from older games. */
  other: z.array(z.string()),
  notes: z.string(),
});
export type StoryDay = z.infer<typeof StoryDay>;

export const StoryEntry = z.discriminatedUnion('kind', [StoryNight, StoryDay]);
export type StoryEntry = z.infer<typeof StoryEntry>;

export const StorytellerView = z.object({
  kind: z.literal('storyteller'),
  code: z.string(),
  meId: PlayerId,
  serverNow: z.number(),
  phase: PhaseView,
  settings: z.object({
    countdownSeconds: z.number(),
    followUpExtensionSeconds: z.number(),
    announceDeaths: z.boolean(),
    notifyOnRoleChange: z.boolean(),
    evilInfoPolicy: z.enum(['house', 'official', 'teensyville']),
  }),
  players: z.array(GrimoirePlayer),
  storytellerAbilities: z.array(AbilityView),
  script: z.array(RoleId),
  seatingPublished: z.boolean(),
  setup: SetupView,
  board: z.array(SubmissionRow),
  review: ReviewView.nullable(),
  dayActions: z.array(DayActionSpec),
  dayEvents: z.array(DayEventView),
  prompts: z.array(PromptView),
  gameEnd: z.array(GameEndSuggestion),
  notes: z.string(),
  /** Standing rules the table must apply today, each one from a role. */
  dayNotices: z.array(z.string()),
  story: z.array(StoryEntry),
});
export type StorytellerView = z.infer<typeof StorytellerView>;

/** Something public the steward can record, from the script alone: whoever is in play, it is offered. */
export const ClaimSpec = z.object({
  roleId: RoleId,
  claim: z.string(),
  title: z.string(),
  /** A player each, the claimant first. */
  fields: z.array(z.string()),
  /** The check before it is recorded, with {0}, {1} for the names. */
  confirm: z.string(),
});
export type ClaimSpec = z.infer<typeof ClaimSpec>;

export const NominationView = z.object({
  id: z.number(),
  nominator: PlayerId,
  nominee: PlayerId,
  /** What the table saw come of it. */
  lines: z.array(z.string()),
  vote: z.object({ voters: z.array(PlayerId), needed: z.number() }).nullable(),
  /** Nothing has come of it, and it is the latest. */
  canUndo: z.boolean(),
});
export type NominationView = z.infer<typeof NominationView>;

/** A public day, in the order it was entered. */
export const PublicDay = z.object({ n: z.number(), lines: z.array(z.string()) });
export type PublicDay = z.infer<typeof PublicDay>;

/**
 * The console of the steward, who runs an autoplay game and plays in it. Built from what the whole table knows, and
 * their own player view. It is never a Storyteller view with fields taken away: a field added there would then leak.
 */
export const StewardView = z.object({
  kind: z.literal('steward'),
  code: z.string(),
  meId: PlayerId,
  serverNow: z.number(),
  phase: PhaseView,
  /** What their own phone would show. */
  me: PlayerView,
  settings: z.object({
    countdownSeconds: z.number(),
    followUpExtensionSeconds: z.number(),
    announceDeaths: z.boolean(),
    evilInfoPolicy: z.enum(['house', 'official', 'teensyville']),
  }),
  players: z.array(
    z.object({
      id: PlayerId,
      name: z.string(),
      seat: z.number().nullable(),
      connected: z.boolean(),
      away: z.boolean(),
      alive: z.boolean(),
      /** The dead have one vote left, or none. */
      votesLeft: z.boolean(),
    }),
  ),
  script: z.array(RoleId),
  /** Roles the script lost when autoplay was chosen. */
  dropped: z.array(RoleId),
  seatingPublished: z.boolean(),
  setup: z.object({
    counts: Counts,
    source: z.enum(['default', 'override']),
    /** Why this script cannot support this many players. Says nothing of who holds what. */
    fit: z.array(z.string()),
  }),
  /** How many have looked at their role, before the first night opens. */
  seenRole: z.object({ seen: z.number(), of: z.number() }).nullable(),
  night: z
    .object({
      /** How many have not pressed done. */
      notDone: z.number(),
      /** Who they are, once the countdown is over. */
      names: z.array(PlayerId).nullable(),
      /** Everyone is done, so the app works the night out. */
      closed: z.boolean(),
      /** When dawn can be called, at the soonest. */
      dawnAt: z.number().nullable(),
      /** `soon` until then, whatever is going on. */
      dawn: z.enum(['soon', 'waiting', 'ready']).nullable(),
      canSkip: z.boolean(),
      /** The app could not finish the night. Never why. */
      stuck: z.boolean(),
    })
    .nullable(),
  day: z
    .object({
      nominations: z.array(NominationView),
      block: z.object({ playerId: PlayerId, votes: z.number() }).nullable(),
      /** Votes it takes: half the living. */
      needed: z.number(),
      claims: z.array(ClaimSpec),
      /** What was claimed today, and what the table was told came of it. */
      claimed: z.array(z.object({ text: z.string(), lines: z.array(z.string()) })),
      /** Asked of every execution, from the script alone. */
      executionQuestions: z.array(z.object({ roleId: RoleId, question: z.string() })),
      /** The execution is done: nothing is left but the night. */
      closed: z.boolean(),
    })
    .nullable(),
  /** What to tell the table now. */
  tell: z.array(z.string()),
  /** The game is decided, and waits to be announced. */
  over: z.object({ winner: Alignment.nullable() }).nullable(),
  /** The player asked to become the Storyteller. */
  offered: PlayerId.nullable(),
  publicStory: z.array(PublicDay),
  /** Everything that really happened. Only once the game has ended. */
  revealed: z
    .object({
      story: z.array(StoryEntry),
      players: z.array(
        z.object({
          id: PlayerId,
          name: z.string(),
          character: RoleId.nullable(),
          believed: RoleId.nullable(),
          alignment: Alignment,
          alive: z.boolean(),
        }),
      ),
      bluffs: z.array(RoleId),
    })
    .nullable(),
});
export type StewardView = z.infer<typeof StewardView>;

export const View = z.discriminatedUnion('kind', [PlayerView, StorytellerView, StewardView]);
export type View = z.infer<typeof View>;
