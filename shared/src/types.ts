import type { Alignment, RoleType } from './roles';

export type Phase = 'LOBBY' | 'SETUP' | 'NIGHT_COLLECTING' | 'NIGHT_RESOLVING' | 'DAY' | 'ENDED';
export type RolePreference = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'none';

export type EffectType = 'poisoned' | 'drunk' | 'protected' | 'devils_advocate' | 'butler_master' | 'witched';
export type EffectExpiry = 'until_dusk' | 'until_source_acts_again' | 'while_source_alive_and_sober' | 'until_removed';
export type Cause =
  | 'poisoner' | 'sailor' | 'innkeeper' | 'goon' | 'philosopher' | 'pukka' | 'no_dashii' | 'vigormortis'
  | 'witch' | 'own_character' | 'admin';

export interface Effect {
  id: string;
  type: EffectType;
  cause: Cause;
  sourcePlayerId: string | null;
  targetPlayerId: string;
  startNight: number;
  expiry: EffectExpiry;
}

export interface Settings {
  countdownSeconds: number;
  ravenkeeperExtensionSeconds: number;
  announceDeaths: boolean;
  notifyOnRoleChange: boolean;
}

// ---- Night actions (inputs) -------------------------------------------------

export interface ActionField {
  kind: 'player' | 'role';
  label: string;
  /** Legal option ids (player ids or role ids). */
  options: string[];
}

export interface ActionSpec {
  /** Unique per player per night. Usually the role id the action belongs to. */
  key: string;
  /** Role id the player believes they are acting as (never "drunk"/"marionette"). */
  roleId: string;
  title: string;
  prompt: string;
  fields: ActionField[];
  /** All player fields must be different players. */
  distinct: boolean;
  /** Player may choose "no action" / "not tonight". */
  allowDecline: boolean;
  declineLabel?: string;
}

export interface ActionChoice { decline?: boolean; values: string[] }
export interface Submission { actions: Record<string, ActionChoice>; submittedAt: number; byAdmin?: boolean }

// ---- Results / notices ------------------------------------------------------

export interface PrivateMessage {
  id: string;
  title: string;
  lines: string[];
  /** night number this belongs to (or -1 for setup) */
  night: number;
  kind: 'result' | 'notice' | 'starting';
}

// ---- Views -------------------------------------------------------------------

export interface PublicPlayer { id: string; name: string; seat: number | null; isAdmin: boolean }

export interface RoleCard { roleId: string; name: string; type: RoleType; abilityText: string }

export interface PlayerView {
  kind: 'player';
  gameCode: string;
  phase: Phase;
  nightNumber: number;
  dayNumber: number;
  nightEndsAt: number | null;
  collectingOpen: boolean;
  serverNow: number;
  me: {
    id: string;
    name: string;
    isAdmin: false;
    alive: boolean;
    hasSeenRole: boolean;
    ghostVoteUsed: boolean;
    role: RoleCard | null;
    submitted: boolean;
    submission: Submission | null;
    actions: ActionSpec[];
    ravenkeeperPrompt: boolean;
    messages: PrivateMessage[];
  };
  players: PublicPlayer[];
  seatingPublished: boolean;
  seating: string[];
  /** Public death list (only when the Storyteller announces deaths). Snapshot taken each dawn. */
  deaths: string[] | null;
  /** Players shown as dead (red) on this phone: snapshot taken each dawn. */
  deadAtDawn: string[];
  enabledRoles: string[];
  hasAdmin: boolean;
}

export interface AdminInfo { kind: 'admin' }

export type { Alignment, RoleType };
