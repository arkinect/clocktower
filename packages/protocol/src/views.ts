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
});
export type RoleCard = z.infer<typeof RoleCard>;

export const PhaseView = z.object({
  kind: z.enum(['lobby', 'setup', 'night', 'day', 'ended']),
  n: z.number(),
  stage: z.enum(['briefing', 'collecting', 'review']).nullable(),
  deadline: z.number().nullable(),
  winner: Alignment.nullable(),
  endedReason: z.enum(['storyteller', 'update']).nullable(),
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
  }),
  players: z.array(PublicPlayer),
  seatingPublished: z.boolean(),
  /** Players shown as dead on this phone: a snapshot taken each dawn. */
  deadAtDawn: z.array(PlayerId),
  announcedDeaths: z.array(PlayerId).nullable(),
  script: z.array(RoleId),
  hasStoryteller: z.boolean(),
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
  stale: z.boolean(),
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
  playerId: PlayerId,
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

export const DayEventView = z.object({ at: z.string(), kind: z.string(), text: z.string() });
export type DayEventView = z.infer<typeof DayEventView>;

export const PromptView = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type PromptView = z.infer<typeof PromptView>;

export const StoryEntry = z.object({
  at: z.string(),
  title: z.string(),
  rows: z.array(z.object({ name: z.string(), character: z.string(), lines: z.array(z.string()) })),
  summary: z.array(z.string()),
});
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
    evilInfoPolicy: z.enum(['house', 'official']),
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

export const View = z.discriminatedUnion('kind', [PlayerView, StorytellerView]);
export type View = z.infer<typeof View>;
