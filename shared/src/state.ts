// Full game state. Only the server and the Admin view ever see this.
import type { Alignment } from './roles';
import type { Effect, Phase, PrivateMessage, RolePreference, Settings, Submission } from './types';

export interface PlayerRec {
  id: string;
  name: string;
  rolePreference: RolePreference;
  isAdmin: boolean;
  seat: number | null;
  tokens: string[];
  alive: boolean;
  /** When the player died. null for the living, and for deaths recorded before schema v2. */
  deadAt: { phase: 'night' | 'day'; number: number } | null;
  deathCause: string | null;
  ghostVoteUsed: boolean;
  lastSeenAt: number;
  hasSeenRole: boolean;
  joinedAt: number;
}

export interface RoleHistoryEntry { at: number; from: string | null; to: string | null; reason: string }

export interface Assignment {
  roleId: string | null;
  believedRoleId: string | null;
  alignment: Alignment;
  retainsAbilityWhenDead: boolean;
  /** Philosopher-gained ability, active from `fromNight`. */
  grantedAbility: { roleId: string; fromNight: number } | null;
  history: RoleHistoryEntry[];
}

export interface SetupState {
  demonBluffs: string[];
  redHerringId: string | null;
  lilMonstaMinionRole: string | null;
  lilMonstaTokenHolderId: string | null;
  mezephelesWord: string | null;
  mezephelesSpent: boolean;
  typeCountsOverride: [number, number, number, number] | null;
  shabalothKills: string[];
  briefingSeen: boolean;
  /** Godfather setup modifier chosen by the Admin; null = not chosen yet (+1 is used for suggestions). */
  godfatherOutsiders: 1 | -1 | null;
  /** The evil team's single Damsel guess. */
  damselGuessUsed: boolean;
  damselGuessResult: { targetId: string; outcome: 'win' | 'no_effect' | 'wrong'; text: string } | null;
}

export interface DayRecord {
  dayNumber: number;
  executedPlayerId: string | null;
  demonVoted: boolean | null;
  jugglerCorrect: number | null;
  moonchildTargetId: string | null;
  mezephelesSayer: string | null;
  gossipStatement: 'none' | 'true' | 'false';
  notes: string;
}

export interface ReviewOption { id: string; label: string }
export interface ReviewItem {
  key: string;
  kind: string;
  title: string;
  description: string;
  options: ReviewOption[];
  default: string;
  chosen: string | null;
}

export interface ResultRow {
  key: string;
  playerId: string;
  roleId: string;
  title: string;
  trueLines: string[];
  suggestedLines: string[];
  finalLines: string[];
  impaired: boolean;
  causes: string[];
  overridden: boolean;
  /** Quick alternative values the Admin can pick (each is a full set of lines). */
  alternatives: string[][];
}

export interface ActorRow {
  slot: string;
  playerId: string;
  roleId: string;
  input: string;
  impaired: boolean;
  causes: string[];
  outcome: string;
}

export interface AbnormalEvent { playerId: string; cause: string; detail: string }

export interface Resolution {
  computedAt: number;
  actors: ActorRow[];
  results: ResultRow[];
  reviewItems: ReviewItem[];
  log: string[];
  deaths: string[];
  revived: string[];
  abnormal: AbnormalEvent[];
  awaitingRavenkeeper: string[];
  notices: { playerId: string; title: string; lines: string[] }[];
  /** The world after the night, committed on publish. */
  after: WorldState;
}

export interface NightState {
  number: number;
  collectingOpen: boolean;
  submissions: Record<string, Submission>;
  ravenSubmissions: Record<string, Submission>;
  seed: number;
  reviewChoices: Record<string, string>;
  overrides: Record<string, string[]>;
  mathAdjust: { add: string[]; remove: string[] };
  resolution: Resolution | null;
}

export interface DayPrompt { id: string; kind: 'scarlet_woman'; title: string; description: string; demonId: string; scarletId: string }

/** Parts of the state that the night engine reads and writes. */
export interface WorldState {
  players: PlayerRec[];
  assignments: Record<string, Assignment>;
  flags: Record<string, Record<string, boolean>>;
  effects: Effect[];
  roleState: Record<string, Record<string, unknown>>;
  setup: SetupState;
}

export const SCHEMA_VERSION = 4;

/** Admin-only story log (owner request): one entry per night and per day. */
export interface StoryPlayer {
  playerId: string;
  name: string;
  seat: number | null;
  roleId: string | null;
  believedRoleId: string | null;
  alignment: string;
  aliveAtStart: boolean;
  aliveAtEnd: boolean;
  impaired: boolean;
  causes: string[];
  actions: { slot: string; roleId: string; input: string; outcome: string }[];
  /** What the player was told at dawn. `trueLines` is set when the sent information differed from the truth. Absent in older entries. */
  received?: { title: string; lines: string[]; trueLines?: string[] }[];
}
export type StoryEntry =
  | { kind: 'night'; night: number; at: number; players: StoryPlayer[]; deaths: string[]; revived: string[] }
  | { kind: 'day'; day: number; at: number; executedPlayerId: string | null; deaths: { playerId: string; cause: string | null }[]; notes: string };

export interface GameState extends WorldState {
  schemaVersion: number;
  id: string;
  code: string;
  phase: Phase;
  nightNumber: number; // -1 before Night 0
  dayNumber: number;
  scriptId: string;
  settings: Settings;
  nightEndsAt: number | null;
  createdAt: number;
  enabledRoles: Record<string, boolean>;
  adminId: string | null;
  seatingPublished: boolean;
  publishedSeating: string[];
  days: Record<number, DayRecord>;
  night: NightState | null;
  messages: Record<string, PrivateMessage[]>;
  pendingNotices: Record<string, PrivateMessage[]>;
  dayPrompts: DayPrompt[];
  story: StoryEntry[];
  /** Who players see as dead: refreshed only when a night is published (dawn). The Storyteller sees live state. */
  publicDead: string[];
  idSeq: number;
}

export interface AdminView {
  kind: 'admin';
  serverNow: number;
  state: GameState;
  meId: string;
  impairment: Record<string, { impaired: boolean; causes: string[] }>;
  expectedActors: string[];
  actorActions: Record<string, { roleId: string; title: string }[]>;
  actorSpecs: Record<string, import('./types').ActionSpec[]>;
  setupChecklist: { id: string; label: string; done: boolean; blocking: boolean }[];
  typeCounts: { target: [number, number, number, number]; actual: [number, number, number, number]; source: 'default' | 'override'; chartOutsiders: number };
  godfatherTriggered: boolean;
  warnings: string[];
  presence: Record<string, boolean>;
  wordList: string[];
}
