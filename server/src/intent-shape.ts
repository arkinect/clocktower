// Checks that an intent from a client has the fields its type declares (shared/src/protocol.ts) before the engine
// sees it, so a phone running a different build gets "Bad request." instead of an engine error. The engine still
// checks what the values mean (phase, roles, legality).
import type { GameState, Intent } from '@ct/shared';

type Check = (v: unknown, s: GameState) => boolean;

const str: Check = (v) => typeof v === 'string';
const bool: Check = (v) => typeof v === 'boolean';
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const any: Check = () => true;
const player: Check = (v, s) => typeof v === 'string' && s.players.some((p) => p.id === v);
const strings: Check = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const players: Check = (v, s) => Array.isArray(v) && v.every((x) => player(x, s));
const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v);
const orNull = (c: Check): Check => (v, s) => v === null || c(v, s);
const optional = (c: Check): Check => (v, s) => v === undefined || c(v, s);
const record = (c: Check): Check => (v, s) =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => c(x, s));
/** A night or follow-up choice: one string per field, whatever the field's kind (a player id, a role id, or the id of
 *  an 'option' answer such as "live"; never the answer's label). validateChoice checks each against the spec. */
const choice: Check = (v, s) =>
  typeof v === 'object' && v !== null && strings((v as { values?: unknown }).values, s) && optional(bool)((v as { decline?: unknown }).decline, s);
const counts: Check = (v) => Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Every intent type, with a check for each of its fields. */
export const INTENT_SHAPES: Record<Intent['type'], Record<string, Check>> = {
  // player
  seen_role: {},
  use_ghost_vote: {},
  submit_night: { actions: record(choice) },
  answer_follow_up: { key: str, choice },
  claim_admin: {},
  // Storyteller
  rename_player: { playerId: player, name: str },
  remove_player: { playerId: player },
  go_setup: {},
  set_role_enabled: { roleId: str, enabled: bool },
  set_all_roles_enabled: { enabled: bool },
  set_seating: { order: players },
  randomise_seating: {},
  publish_seating: {},
  assign_role: { playerId: player, roleId: orNull(str) },
  assign_many: { assignments: record(str) },
  suggest_distribution: {},
  set_alignment: { playerId: player, alignment: oneOf('good', 'evil') },
  set_believed_role: { playerId: player, roleId: orNull(str) },
  set_type_counts: { counts: orNull(counts) },
  set_bluffs: { roleIds: strings },
  suggest_bluffs: {},
  set_red_herring: { playerId: orNull(player) },
  suggest_red_herring: {},
  set_mezepheles_word: { word: str },
  random_mezepheles_word: {},
  set_lil_monsta_minion: { roleId: orNull(str) },
  set_setting: { key: str, value: any },
  begin_night0: { force: optional(bool) },
  start_collecting: {},
  start_night: { force: optional(bool) },
  extend_countdown: { seconds: num },
  set_countdown: { seconds: num },
  submit_for: { playerId: player, actions: record(choice) },
  mark_no_action: { playerId: player },
  clear_submission: { playerId: player },
  resolve_night: { force: optional(bool) },
  reopen_collecting: {},
  choose_review: { key: str, optionId: orNull(str) },
  accept_all_defaults: {},
  override_result: { key: str, lines: orNull(strings) },
  math_adjust: { add: strings, remove: strings },
  answer_follow_up_for: { key: str, choice },
  publish_night: { force: optional(bool) },
  mark_alive: { playerId: player, alive: bool },
  record_execution: { playerId: orNull(player), died: bool },
  set_day_fact: { key: oneOf('demonVoted', 'jugglerCorrect', 'moonchildTargetId', 'mezephelesSayer', 'gossipStatement', 'notes'), value: any },
  set_godfather_outsiders: { value: oneOf(1, -1, null) },
  set_godfather_trigger: { value: orNull(bool) },
  day_kill: {
    kind: oneOf('slayer', 'witch'), sourceId: player, targetId: player,
    recluseAs: optional(oneOf('truthful', 'minion', 'demon')), mode: oneOf('preview', 'accept', 'force_death', 'force_survive'),
  },
  damsel_guess: { targetId: player },
  set_damsel_guess_used: { value: bool },
  set_cannibal_ability: { playerId: player, roleId: orNull(str) },
  set_flag: { playerId: player, key: str, value: bool },
  set_ghost_vote: { playerId: player, used: bool },
  resolve_day_prompt: { id: str, accept: bool },
  remove_effect: { effectId: str },
  add_effect: { targetId: player, effectType: oneOf('poisoned', 'drunk') },
  set_lil_monsta_holder: { playerId: orNull(player) },
  end_game: {},
  play_again: {},
  force_phase: { phase: oneOf('LOBBY', 'SETUP', 'DAY', 'ENDED') },
};

/** Whether `intent` is an object of a known type whose fields have the declared types. */
export function wellFormedIntent(s: GameState, intent: unknown): intent is Intent {
  if (typeof intent !== 'object' || intent === null) return false;
  const i = intent as Record<string, unknown>;
  const shape = typeof i.type === 'string' && Object.hasOwn(INTENT_SHAPES, i.type) ? INTENT_SHAPES[i.type as Intent['type']] : null;
  return !!shape && Object.entries(shape).every(([k, check]) => check(i[k], s));
}
