// Intents: everything a client can ask the server to do. The server validates every one.
import type { ActionChoice, RolePreference } from './types';

export type PlayerIntent =
  | { type: 'seen_role' }
  | { type: 'use_ghost_vote' }
  | { type: 'submit_night'; actions: Record<string, ActionChoice> }
  | { type: 'submit_ravenkeeper'; targetId: string }
  | { type: 'claim_admin' };

export type AdminIntent =
  | { type: 'rename_player'; playerId: string; name: string }
  | { type: 'remove_player'; playerId: string }
  | { type: 'go_setup' }
  | { type: 'set_role_enabled'; roleId: string; enabled: boolean }
  | { type: 'set_all_roles_enabled'; enabled: boolean }
  | { type: 'set_seating'; order: string[] }
  | { type: 'randomise_seating' }
  | { type: 'publish_seating' }
  | { type: 'assign_role'; playerId: string; roleId: string | null }
  | { type: 'assign_many'; assignments: Record<string, string> }
  | { type: 'suggest_distribution' }
  | { type: 'set_alignment'; playerId: string; alignment: 'good' | 'evil' }
  | { type: 'set_believed_role'; playerId: string; roleId: string | null }
  | { type: 'set_type_counts'; counts: [number, number, number, number] | null }
  | { type: 'set_bluffs'; roleIds: string[] }
  | { type: 'suggest_bluffs' }
  | { type: 'set_red_herring'; playerId: string | null }
  | { type: 'suggest_red_herring' }
  | { type: 'set_mezepheles_word'; word: string }
  | { type: 'random_mezepheles_word' }
  | { type: 'set_lil_monsta_minion'; roleId: string | null }
  | { type: 'set_setting'; key: string; value: unknown }
  | { type: 'begin_night0'; force?: boolean }
  | { type: 'start_collecting' }
  | { type: 'start_night'; force?: boolean }
  | { type: 'extend_countdown'; seconds: number }
  | { type: 'set_countdown'; seconds: number }
  | { type: 'submit_for'; playerId: string; actions: Record<string, ActionChoice> }
  | { type: 'mark_no_action'; playerId: string }
  | { type: 'clear_submission'; playerId: string }
  | { type: 'resolve_night'; force?: boolean }
  | { type: 'reopen_collecting' }
  | { type: 'choose_review'; key: string; optionId: string | null }
  | { type: 'accept_all_defaults' }
  | { type: 'override_result'; key: string; lines: string[] | null }
  | { type: 'math_adjust'; add: string[]; remove: string[] }
  | { type: 'ravenkeeper_for'; playerId: string; targetId: string }
  | { type: 'publish_night'; force?: boolean }
  | { type: 'mark_alive'; playerId: string; alive: boolean }
  | { type: 'record_execution'; playerId: string | null; died: boolean }
  | { type: 'set_day_fact'; key: 'demonVoted' | 'jugglerCorrect' | 'moonchildTargetId' | 'mezephelesSayer' | 'gossipStatement' | 'notes'; value: unknown }
  | { type: 'set_godfather_outsiders'; value: 1 | -1 | null }
  | { type: 'set_godfather_trigger'; value: boolean | null }
  | { type: 'day_kill'; kind: 'slayer' | 'witch'; sourceId: string; targetId: string; recluseAs?: 'truthful' | 'minion' | 'demon'; mode: 'preview' | 'accept' | 'force_death' | 'force_survive' }
  | { type: 'damsel_guess'; targetId: string }
  | { type: 'set_damsel_guess_used'; value: boolean }
  | { type: 'set_flag'; playerId: string; key: string; value: boolean }
  | { type: 'set_ghost_vote'; playerId: string; used: boolean }
  | { type: 'resolve_day_prompt'; id: string; accept: boolean }
  | { type: 'remove_effect'; effectId: string }
  | { type: 'add_effect'; targetId: string; effectType: 'poisoned' | 'drunk' }
  | { type: 'set_lil_monsta_holder'; playerId: string | null }
  | { type: 'end_game' }
  | { type: 'force_phase'; phase: 'LOBBY' | 'SETUP' | 'DAY' | 'ENDED' };

export type Intent = PlayerIntent | AdminIntent;

export interface JoinRequest { name: string; rolePreference: RolePreference; wantsAdmin: boolean }
export interface JoinResponse { token: string; playerId: string; isAdmin: boolean; notice?: string }
