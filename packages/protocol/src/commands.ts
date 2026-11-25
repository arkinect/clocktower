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
export const AssignMany = c('assign_many', { assignments: z.record(PlayerId, RoleId) });
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
  evilInfoPolicy: z.enum(['house', 'official', 'teensyville']).optional(),
});
export const BeginFirstNight = c('begin_first_night', { force: z.boolean().optional() });

// ---- night ----
export const OpenCollecting = c('open_collecting', {});
export const CloseCollecting = c('close_collecting', { force: z.boolean().optional() });
export const ReopenCollecting = c('reopen_collecting', {});
export const ExtendCountdown = c('extend_countdown', { seconds: z.number().int().min(0).max(3600) });
export const SubmitNight = c('submit_night', { actions: Actions });
export const SubmitFor = c('submit_for', { playerId: PlayerId, actions: Actions });
export const MarkNoAction = c('mark_no_action', { playerId: PlayerId });
export const ClearSubmission = c('clear_submission', { playerId: PlayerId });
export const Decide = c('decide', { key: DecisionKey, option: z.string().min(1).max(64).nullable() });
export const AcceptAllDefaults = c('accept_all_defaults', {});
export const OverrideResult = c('override_result', { resultKey: Key, lines: z.array(Line).max(10).nullable() });
/** In review: records again a day fact tonight reads (see DayActionSpec.neededTonight). No values takes it back. */
export const RecordFact = c('record_fact', {
  abilityId: AbilityId,
  action: z.string().min(1).max(64),
  values: z.array(z.string().min(1).max(64)).max(16),
});
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
  // Up to 16: rows send every row's values in one list.
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

// ---- autoplay ----
// The steward's own list: nothing here is shared with the Storyteller, and none of it takes a `force`.
const StewardSettings = {
  countdownSeconds: Seconds.optional(),
  followUpExtensionSeconds: Seconds.optional(),
  announceDeaths: z.boolean().optional(),
  evilInfoPolicy: z.enum(['house', 'official', 'teensyville']).optional(),
};
/** Before the deal: the Storyteller becomes the steward, who plays too, and the app runs the game. */
export const ChooseAutoplay = c('choose_autoplay', {});
/** Before the deal: back to a Storyteller game. */
export const LeaveAutoplay = c('leave_autoplay', {});
export const StewardRename = c('steward_rename', { playerId: PlayerId, name: Name });
export const StewardRemove = c('steward_remove', { playerId: PlayerId });
export const StewardOpenSetup = c('steward_open_setup', {});
export const StewardScript = c('steward_script', { roleIds: Roles });
export const StewardSeating = c('steward_seating', { order: Players });
export const StewardShuffle = c('steward_shuffle', {});
export const StewardPublishSeating = c('steward_publish_seating', {});
/** Where the deal starts from. The characters dealt may still change it. */
export const StewardCounts = c('steward_counts', {
  counts: z.array(z.number().int().min(0).max(40)).length(4).nullable(),
});
export const StewardSet = c('steward_settings', StewardSettings);
/** A complete random setup, unseen, and straight to the phones. There is no second deal. */
export const Deal = c('deal', {});
export const OpenNight = c('open_night', {});
export const AddTime = c('add_time', { seconds: z.number().int().min(10).max(3600) });
/** Once the countdown is over: plays on without a player's choice. */
export const SkipPlayer = c('skip_player', { playerId: PlayerId });
/** Once their time is over: plays on without the answers to the night's questions. */
export const SkipQuestions = c('skip_questions', {});
export const RetryNight = c('retry_night', {});
export const CallDawn = c('call_dawn', {});
export const Nominate = c('nominate', { nominator: PlayerId, nominee: PlayerId });
/** Takes back the last nomination, while nothing public has come of it. */
export const UndoNomination = c('undo_nomination', { id: z.number().int() });
/** Who voted, entered once or corrected. */
export const CountVote = c('count_vote', { id: z.number().int(), voters: Players });
/** What a player said in public. The app decides whether it meant anything. */
export const MakeClaim = c('make_claim', {
  roleId: RoleId,
  claim: z.string().min(1).max(64),
  values: Players.max(8),
});
/** Today's execution, or none, which happens at once. `yes`: the roles whose question at the execution was a yes. */
export const Execute = c('execute', { playerId: PlayerId.nullable(), yes: Roles.max(8) });
export const BeginNight = c('begin_night', {});
/** The game is over and the app has said who won: the phones end now. */
export const AnnounceEnd = c('announce_end', {});
export const SetAway = c('set_away', { playerId: PlayerId, away: z.boolean() });
export const HandSteward = c('hand_steward', { playerId: PlayerId });
/** Asks a player to stop playing and become the Storyteller. Null takes the offer back. */
export const OfferStoryteller = c('offer_storyteller', { playerId: PlayerId.nullable() });
export const Abandon = c('abandon', {});
export const StewardPlayAgain = c('steward_play_again', {});
export const StewardNewGame = c('steward_new_game', {});
/** A player's own: something their ability asks them by day, in private. No values takes it back. */
export const AnswerDayPrompt = c('answer_day_prompt', {
  key: Key,
  values: z.array(z.string().min(1).max(64)).max(16),
});
export const AcceptStoryteller = c('accept_storyteller', {});
/** The server's own: everyone has chosen, so the night is worked out. */
export const AutoClose = c('auto_close', {});
/** The server's own: a question to a player who was away when the night closed. */
export const AutoAnswer = c('auto_answer', {});

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
  SubmitNight,
  SubmitFor,
  MarkNoAction,
  ClearSubmission,
  Decide,
  AcceptAllDefaults,
  OverrideResult,
  RecordFact,
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
  ChooseAutoplay,
  LeaveAutoplay,
  StewardRename,
  StewardRemove,
  StewardOpenSetup,
  StewardScript,
  StewardSeating,
  StewardShuffle,
  StewardPublishSeating,
  StewardCounts,
  StewardSet,
  Deal,
  OpenNight,
  AddTime,
  SkipPlayer,
  SkipQuestions,
  RetryNight,
  CallDawn,
  Nominate,
  UndoNomination,
  CountVote,
  MakeClaim,
  Execute,
  BeginNight,
  AnnounceEnd,
  SetAway,
  HandSteward,
  OfferStoryteller,
  Abandon,
  StewardPlayAgain,
  StewardNewGame,
  AnswerDayPrompt,
  AcceptStoryteller,
  AutoClose,
  AutoAnswer,
]);
export type Command = z.infer<typeof Command>;
export type CommandType = Command['type'];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
