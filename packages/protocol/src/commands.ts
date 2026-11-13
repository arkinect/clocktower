import { z } from 'zod';
import { Actions, Choice, DecisionKey, Decisions } from './actions';
import { AbilityId, Alignment, ConditionId, PlayerId, RoleId, RolePreference } from './ids';

const Name = z.string().min(1).max(64);
const Seconds = z.number().int().min(10).max(3600);
const Line = z.string().max(300);
const Roles = z.array(RoleId).max(128);
const Players = z.array(PlayerId).max(40);
const Key = z.string().min(1).max(200);
const c = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), ...shape });

// ---- lobby ----
export const Join = c('join', {
  id: PlayerId,
  name: Name,
  rolePreference: RolePreference,
  wantsStoryteller: z.boolean(),
});
export const ClaimStoryteller = c('claim_storyteller', {});
export const RenamePlayer = c('rename_player', { playerId: PlayerId, name: Name });
export const RemovePlayer = c('remove_player', { playerId: PlayerId });
export const OpenSetup = c('open_setup', {});

// ---- setup ----
export const SetScript = c('set_script', { roleIds: Roles });
export const SetStorytellerCharacters = c('set_storyteller_characters', { roleIds: Roles.max(16) });
export const SetSeating = c('set_seating', { order: Players });
export const RandomiseSeating = c('randomise_seating', {});
export const PublishSeating = c('publish_seating', {});
export const AssignCharacter = c('assign_character', { playerId: PlayerId, roleId: RoleId.nullable() });
export const AssignMany = c('assign_many', { assignments: z.record(z.string().min(1).max(64), RoleId) });
export const SuggestDistribution = c('suggest_distribution', {});
export const SetAlignment = c('set_alignment', { playerId: PlayerId, alignment: Alignment });
export const SetBelieved = c('set_believed', { playerId: PlayerId, roleId: RoleId.nullable() });
export const SetTypeCounts = c('set_type_counts', {
  counts: z.array(z.number().int().min(0).max(40)).length(4).nullable(),
});
export const SetBluffs = c('set_bluffs', { roleIds: Roles.max(3) });
export const SuggestBluffs = c('suggest_bluffs', {});
export const SetSetupField = c('set_setup_field', {
  abilityId: AbilityId,
  field: z.string().min(1).max(64),
  value: z.string().max(64).nullable(),
});
export const SuggestSetupField = c('suggest_setup_field', { abilityId: AbilityId, field: z.string().min(1).max(64) });
export const SetSettings = c('set_settings', {
  countdownSeconds: Seconds.optional(),
  followUpExtensionSeconds: Seconds.optional(),
  announceDeaths: z.boolean().optional(),
  notifyOnRoleChange: z.boolean().optional(),
  evilInfoPolicy: z.enum(['house', 'official']).optional(),
});
export const BeginFirstNight = c('begin_first_night', { force: z.boolean().optional() });

// ---- night ----
export const OpenCollecting = c('open_collecting', {});
export const CloseCollecting = c('close_collecting', { force: z.boolean().optional() });
export const ReopenCollecting = c('reopen_collecting', {});
export const ExtendCountdown = c('extend_countdown', { seconds: z.number().int().min(0).max(3600) });
export const SetCountdown = c('set_countdown', { seconds: Seconds });
export const SubmitNight = c('submit_night', { actions: Actions });
export const SubmitFor = c('submit_for', { playerId: PlayerId, actions: Actions });
export const MarkNoAction = c('mark_no_action', { playerId: PlayerId });
export const ClearSubmission = c('clear_submission', { playerId: PlayerId });
export const Decide = c('decide', { key: DecisionKey, option: z.string().min(1).max(64).nullable() });
export const AcceptAllDefaults = c('accept_all_defaults', {});
export const OverrideResult = c('override_result', { resultKey: Key, lines: z.array(Line).max(10).nullable() });
export const AdjustMalfunctions = c('adjust_malfunctions', { add: Players, remove: Players });
export const AnswerQuestion = c('answer_question', { key: Key, choice: Choice });
export const AnswerQuestionFor = c('answer_question_for', { key: Key, choice: Choice });
export const PublishDawn = c('publish_dawn', { force: z.boolean().optional() });
export const StartNight = c('start_night', { force: z.boolean().optional() });

// ---- day ----
export const SeenRole = c('seen_role', {});
export const UseGhostVote = c('use_ghost_vote', {});
export const SetGhostVote = c('set_ghost_vote', { playerId: PlayerId, used: z.boolean() });
export const MarkAlive = c('mark_alive', { playerId: PlayerId, alive: z.boolean() });
export const RecordNomination = c('record_nomination', { nominator: PlayerId.nullable(), nominee: PlayerId });
export const RecordVote = c('record_vote', {
  nominee: PlayerId,
  count: z.number().int().min(0).max(40).nullable(),
  voters: Players.nullable(),
});
export const RecordExecution = c('record_execution', { playerId: PlayerId.nullable(), died: z.boolean() });
export const RecordStatement = c('record_statement', { playerId: PlayerId, text: z.string().max(500) });
export const RecordBrokeMadness = c('record_broke_madness', { playerId: PlayerId, ruling: z.string().max(200) });
export const SetNotes = c('set_notes', { text: z.string().max(2000) });
export const DayAction = c('day_action', {
  abilityId: AbilityId,
  action: z.string().min(1).max(64),
  // Up to 16: rows (the Juggler's five guesses) send every row's values in one list.
  values: z.array(z.string().min(1).max(64)).max(16),
  mode: z.enum(['preview', 'accept', 'force_success', 'force_fail']),
  decisions: Decisions.optional(),
});
export const ResolvePrompt = c('resolve_prompt', { id: Key, option: z.string().min(1).max(64) });
export const SetAbilityUsed = c('set_ability_used', { abilityId: AbilityId, used: z.boolean() });
export const AddCondition = c('add_condition', { target: PlayerId, condition: z.enum(['drunk', 'poisoned', 'mad']) });
export const RemoveCondition = c('remove_condition', { conditionId: ConditionId });
export const AddTraveller = c('add_traveller', { playerId: PlayerId, roleId: RoleId, alignment: Alignment });
export const ExileTraveller = c('exile_traveller', { playerId: PlayerId });
export const RemoveTraveller = c('remove_traveller', { playerId: PlayerId });
export const ConfirmGameEnd = c('confirm_game_end', { key: Key });
export const DismissGameEnd = c('dismiss_game_end', { key: Key });
export const EndGame = c('end_game', { winner: Alignment.nullable().optional() });
export const PlayAgain = c('play_again', {});
/** Removes every player, the Storyteller included, and resets the script. Only the settings stay. */
export const NewGame = c('new_game', {});
export const ForcePhase = c('force_phase', { phase: z.enum(['lobby', 'setup', 'day', 'ended']) });

export const Command = z.discriminatedUnion('type', [
  Join,
  ClaimStoryteller,
  RenamePlayer,
  RemovePlayer,
  OpenSetup,
  SetScript,
  SetStorytellerCharacters,
  SetSeating,
  RandomiseSeating,
  PublishSeating,
  AssignCharacter,
  AssignMany,
  SuggestDistribution,
  SetAlignment,
  SetBelieved,
  SetTypeCounts,
  SetBluffs,
  SuggestBluffs,
  SetSetupField,
  SuggestSetupField,
  SetSettings,
  BeginFirstNight,
  OpenCollecting,
  CloseCollecting,
  ReopenCollecting,
  ExtendCountdown,
  SetCountdown,
  SubmitNight,
  SubmitFor,
  MarkNoAction,
  ClearSubmission,
  Decide,
  AcceptAllDefaults,
  OverrideResult,
  AdjustMalfunctions,
  AnswerQuestion,
  AnswerQuestionFor,
  PublishDawn,
  StartNight,
  SeenRole,
  UseGhostVote,
  SetGhostVote,
  MarkAlive,
  RecordNomination,
  RecordVote,
  RecordExecution,
  RecordStatement,
  RecordBrokeMadness,
  SetNotes,
  DayAction,
  ResolvePrompt,
  SetAbilityUsed,
  AddCondition,
  RemoveCondition,
  AddTraveller,
  ExileTraveller,
  RemoveTraveller,
  ConfirmGameEnd,
  DismissGameEnd,
  EndGame,
  PlayAgain,
  NewGame,
  ForcePhase,
]);
export type Command = z.infer<typeof Command>;
export type CommandType = Command['type'];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
