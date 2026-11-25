// A role is one file: defineRole gives it display data, flags, data rules and hooks. The core only ever iterates
// ability instances and calls these hooks; it never names a role.
import type {
  ActionField,
  ActionMode,
  Alignment,
  CharacterType,
  DecisionKey,
  PlayerId,
  RoleCard,
  RoleId,
} from '@ct/protocol';
import type { AbilityInstance, Expiry } from '../model/state';
import type { AbilityCtx, HookCtx } from '../night/context';
import type { Reader } from '../derive/reader';

export type Counts = [townsfolk: number, outsiders: number, minions: number, demons: number];

/** A field as a role writes it. Without a label it is called by its kind ("Player 2"). */
export type DraftField = Omit<ActionField, 'label'> & { label?: string };

/**
 * A picker or question, before the core fills in its key and the title the holder sees. The prompt and labels are
 * words around the fields: a holder who does not know the ability by its own name sees none of them.
 */
export interface SpecDraft {
  title?: string;
  prompt?: string;
  fields: DraftField[];
  distinct?: boolean;
  allowDecline?: boolean;
  declineLabel?: string;
  /** `fields` is one row, and the answer is 1 to this many rows (see ActionSpec). Day rows: how many. Default 1. */
  maxRows?: number;
  /** Either/or: the player uses one of these (see ActionSpec), which `ctx.mode` then names. Night pickers only. */
  modes?: ActionMode[];
}

export interface DayActionDraft extends SpecDraft {
  action: string;
  /** Consequential actions go through preview and accept. Default true. */
  preview?: boolean;
  /** Today's recorded answer, one value per field. Default null. */
  recorded?: string[] | null;
  /** Tonight reads this answer, so the Review tab can record it again (`record_fact`). Default false. */
  neededTonight?: boolean;
  /** Start Night waits for an answer (or force): dusk itself reads it. Default false. */
  blocksNight?: boolean;
  /** Its place in the Day events list, roughly when in a day it happens. Default 1000, after the rest. */
  order?: number;
  /** How the Day tab asks for it (see DayActionSpec). Default 'select'. */
  control?: 'select' | 'toggle' | 'rows';
  /** Shown while nothing is recorded, and recorded at dusk if nothing else was. Default none. */
  default?: string[];
  /** applyDayAction gets no values to take the answer back. Default false. */
  clearable?: boolean;
  /** The select's "nothing happened" option. */
  emptyLabel?: string;
  /** Autoplay: the holder answers this themself, in private. Their words for it. */
  asksHolder?: string;
}

export interface DayActionOutcome {
  /** One sentence for the Storyteller. */
  summary: string;
  /** Whether an accept would do what the action is for. */
  effective: boolean;
}

export interface KillAttempt {
  target: PlayerId;
  cause: string;
  attacker: PlayerId | null;
  /** The ability behind the attack, when one is. */
  attackerAbility: string | null;
  /** Ignores everything that would stop a death, except what says otherwise. */
  unstoppable: boolean;
  /** Re-entered from a redirect: a redirect happens once. */
  redirected: boolean;
  /** This death hands the Demon on by itself, so nothing else may. */
  demonHandover: boolean;
}

export type InterceptResult = 'pass' | 'prevent' | { redirect: PlayerId };

/** A condition that would impair a player right now. */
export interface ImpairingCondition {
  type: 'drunk' | 'poisoned';
  target: PlayerId;
  /** The player behind it; null for the Storyteller. */
  sourcePlayer: PlayerId | null;
  label: string;
}

/** A vote as the Storyteller recorded it. `count` is the tally so far; later hooks see earlier changes. */
export interface VoteTally {
  nominee: PlayerId;
  voters: PlayerId[] | null;
  count: number | null;
}

export interface DeathInfo {
  playerId: PlayerId;
  cause: string;
  wasDemon: boolean;
  /** Living non-Travellers just before this death, the count role text means by "players alive". */
  aliveBefore: number;
  demonHandover: boolean;
  /** Whether the dying player's abilities were working at that moment. */
  impairedAtDeath: boolean;
}

export type DayEventInfo =
  /** A null nominator is the Storyteller. */
  | { kind: 'nomination'; nominator: PlayerId | null; nominee: PlayerId }
  | { kind: 'vote'; nominee: PlayerId; count: number | null; voters: PlayerId[] | null }
  | { kind: 'execution'; playerId: PlayerId | null; died: boolean; demonDiedAliveBefore: number | null }
  | { kind: 'exile'; playerId: PlayerId }
  | { kind: 'statement'; playerId: PlayerId; text: string };

export interface RegistrationQuery {
  asker: { player: PlayerId | null; ability: string; name: string };
  wants: 'alignment' | 'character';
}

export interface Registration {
  character: RoleId;
  type: CharacterType;
  alignment: Alignment;
  alive: boolean;
}

export interface EvilInfoDraft {
  /** Players told who the other Minions are. */
  minions: PlayerId[];
  /** Players the Demon is told are its Minions. */
  demonSees: PlayerId[];
  /** Extra lines for the Demon. */
  demonLines: string[];
  /** Whether Minions also learn the Demon. */
  minionsLearnDemon: boolean;
}

export interface DerivedCondition {
  target: PlayerId;
  type: 'drunk' | 'poisoned';
}

export interface InfoDraft {
  key: string;
  playerId: PlayerId;
  roleId: RoleId;
  truth: string[];
  suggested: string[];
}

export interface SetupField {
  field: string;
  title: string;
  kind: 'player' | 'role' | 'option' | 'text';
  options(r: Reader): { id: string; label: string }[];
  /** Offers a value (a random word, a random herring). */
  suggest?(r: Reader, pick: <T>(items: readonly T[]) => T): string | null;
  /** Optional check of a value before it is stored; returns an error. */
  validate?(r: Reader, value: string): string | null;
  /** Hidden until this says so. */
  when?(r: Reader): boolean;
  /** What a stored value means now, if that can change with the rest of the setup. */
  shown?(r: Reader, value: string | null): string | null;
  /**
   * Shown under the holder's character choice, after their name ("Bo plays as"), instead of in the
   * Character setup list.
   */
  rowLabel?: string;
  /** Autoplay: also drawn when the ability is gained during the game, if nobody has a value yet. */
  drawnWhenGained?: boolean;
}

export interface SetupQuery {
  /** Roles assigned or proposed. */
  roles: readonly RoleId[];
  playerCount: number;
  /** A value the Storyteller chose in this role's setup field, if any. */
  field(role: RoleId, field: string): string | null;
}

export interface SetupRules {
  /** The setup field that `counts` reads, and its values. Autoplay draws one, evenly. */
  choice?: { field: string; options: readonly string[] };
  /** Adjust the [townsfolk, outsiders, minions, demons] target. */
  counts?(c: Counts, q: SetupQuery): void;
  /** Runs after every other count rule (a choice that depends on them). */
  late?: boolean;
  /** Characters that must be in play with this one. */
  requires?: readonly RoleId[];
  /** Characters a suggested distribution never pairs with this one. */
  excludes?: readonly RoleId[];
  /** This character must neighbour a character of this type. */
  neighbours?: CharacterType;
  /** Several players may hold the same character: this one, or any good character. */
  duplicates?: 'self' | 'good';
  /** Never offered or accepted as a Demon bluff, even when good and out of play. */
  notBluffable?: boolean;
}

export interface Believes {
  /** Which characters this one may think it is. */
  allowed(role: { type: CharacterType; alignment: Alignment }): boolean;
  label: string;
  /** A believed ability that does nothing at all, rather than one drunk or poisoned. */
  perceivedOnly?: boolean;
}

export interface Hooks<S> {
  /** The character is assigned or gained. */
  setup?(ctx: AbilityCtx<S>): void;
  /** Night 0 starts: start messages. */
  briefing?(ctx: AbilityCtx<S>): void;
  /** The walk is about to begin: decisions that decide who wakes. */
  nightStart?(ctx: AbilityCtx<S>): void;
  modifyEvilInfo?(ctx: HookCtx<S>, info: EvilInfoDraft): void;
  /** Whether it wakes tonight. Default: every night in its slot; start information only when due. */
  wakes?(ctx: AbilityCtx<S>): boolean;
  /** Dead tonight, but wakes anyway. */
  wakesDead?(ctx: AbilityCtx<S>): boolean;
  /**
   * Stops another ability waking tonight, when the night resolves. Pickers do not change while players submit, so
   * nobody learns anything from one vanishing: the stopped ability's choice is simply ignored. Only an ability that
   * acts earlier in the night order can do this, and only while it would wake, can act and is not impaired. It stops
   * that one ability: the holder still wakes for any other.
   */
  stopsWaking?(ctx: AbilityCtx<S>, target: Instance, def: RoleDef): boolean;
  /** That ability acts a second time tonight, after its first. It asks again, as a question, if it has a picker. */
  wakesTwice?(ctx: AbilityCtx<S>, target: Instance): boolean;
  /** The night order has finished, before anything acts for a death after its slot. */
  nightEnd?(ctx: AbilityCtx<S>): void;
  /** The day is ending. Runs before conditions lasting until dusk are removed. */
  onDusk?(ctx: AbilityCtx<S>): void;
  picker?(ctx: AbilityCtx<S>): SpecDraft | null;
  resolve?(ctx: AbilityCtx<S>): void;
  interceptKill?(ctx: AbilityCtx<S>, kill: KillAttempt): InterceptResult;
  onDeath?(ctx: AbilityCtx<S>, death: DeathInfo): void;
  onDayEvent?(ctx: AbilityCtx<S>, event: DayEventInfo): void;
  /** Another ability chose the holder. */
  onChosen?(ctx: AbilityCtx<S>, chooser: { player: PlayerId; ability: string }): void;
  onRevive?(ctx: AbilityCtx<S>, playerId: PlayerId): void;
  dayActions?(ctx: AbilityCtx<S>): DayActionDraft[];
  applyDayAction?(
    ctx: AbilityCtx<S>,
    action: string,
    values: string[],
    force: 'none' | 'success' | 'fail',
  ): DayActionOutcome;
  /**
   * Autoplay: a nomination was just made. For what a nomination itself sets off, which in a Storyteller's game is a
   * day action used when it happens. Share that action's code, so both modes do the same.
   */
  onNomination?(ctx: AbilityCtx<S>, nomination: { nominator: PlayerId; nominee: PlayerId }): void;
  /**
   * Autoplay: one of this role's claims (see AutoplaySupport) was made in public. Called on every instance of the role,
   * so it must check the claimant is the one it means. Whatever it does not recognise, it ignores.
   */
  onClaim?(ctx: AbilityCtx<S>, claim: { claim: string; values: readonly PlayerId[] }): void;
  /** Autoplay: the question at an execution was a yes, for this player. True: they do not die. */
  survivesExecution?(ctx: AbilityCtx<S>, player: PlayerId): boolean;
  /** A prompt raised at day was answered. */
  onPrompt?(ctx: AbilityCtx<S>, kind: string, subject: string | null, option: string): void;
  registersAs?(ctx: AbilityCtx<S>, query: RegistrationQuery): Registration | null;
  /** How another player registers, when this ability is what makes them false. Their own abilities answer first. */
  registersOther?(ctx: AbilityCtx<S>, subject: PlayerId, query: RegistrationQuery): Registration | null;
  /** True stops a player changing alignment. */
  guardsAlignment?(ctx: AbilityCtx<S>, change: { target: PlayerId; to: Alignment; reason: string }): boolean;
  /** True stops this condition impairing its target. Judged after the three impairment stages. */
  shieldsFrom?(ctx: HookCtx<S>, condition: ImpairingCondition): boolean;
  /** True keeps every other ability's transformInfo off this player's results. */
  guaranteesTruth?(ctx: AbilityCtx<S>, player: PlayerId): boolean;
  /** The winner the game actually gives, for any suggested end. Return the same winner to leave it. */
  changesWinner?(ctx: AbilityCtx<S>, winner: Alignment): Alignment;
  /** Changes a recorded vote, for weights, who may vote and how an execution passes. Null leaves it. */
  adjustVote?(ctx: AbilityCtx<S>, vote: VoteTally): number | null;
  /** Shows this player no character, whatever they hold. */
  hidesCharacter?(ctx: HookCtx<S>, player: PlayerId): boolean;
  /** The holder is alive, but the table is told they are dead. */
  appearsDead?(ctx: HookCtx<S>): boolean;
  deriveConditions?(ctx: HookCtx<S>): DerivedCondition[];
  transformInfo?(ctx: AbilityCtx<S>, info: InfoDraft): string[] | null;
  /** Lines of hidden data the holder may see in their own view. */
  visibility?(ctx: HookCtx<S>): { title: string; lines: string[] }[];
  checkGameEnd?(ctx: AbilityCtx<S>): void;
  /** The holder's character is about to change away from this ability. */
  onCharacterChange?(ctx: AbilityCtx<S>, change: { from: RoleId | null; to: RoleId | null }): void;
  /** Any player's character changed. */
  observeCharacterChange?(ctx: AbilityCtx<S>, change: { playerId: PlayerId; from: RoleId | null; to: RoleId }): void;
  /** Dawn is being committed. */
  onPublish?(ctx: AbilityCtx<S>): void;
  /** Setup checklist rows for this ability in play. */
  checklist?(ctx: HookCtx<S>): { id: string; label: string; done: boolean; blocking: boolean }[];
  warnings?(ctx: HookCtx<S>): string[];
  /** Standing rule the table applies today. */
  dayNotice?(ctx: AbilityCtx<S>): string | null;
  /** Lines describing this ability's memory for the grimoire. */
  summary?(ctx: HookCtx<S>): string[];
}

export interface RoleFlags {
  /** Acts after the holder has died. */
  worksWhileDead?: boolean;
  /** "You start knowing": wakes on night 0, or the first night after it is gained. */
  startInfo?: boolean;
  /** 'auto': the engine marks it used. 'manual': the Storyteller ticks it. */
  oncePerGame?: 'auto' | 'manual';
  /** Holding this ability makes the holder the Demon. A function decides it per instance. */
  holderIsDemon?: boolean | ((a: Instance) => boolean);
  /** Wakes only on a night they die, and then though dead. Impairment is taken at the moment of death. */
  wakesOnNightDeath?: boolean;
  /** With wakesOnNightDeath: also acts once the order is done, for a death after its slot. */
  afterOrder?: boolean;
  /** With wakesOnNightDeath: asks the holder a question. */
  asksOnDeath?: boolean;
  /** Shown in the day screen's reminders. */
  dayReminder?: boolean;
  /**
   * The ability belongs to no player: whoever holds it being drunk or poisoned does not affect it, and it stays with
   * them if their character changes.
   */
  neverImpaired?: boolean;
  /** Interception order; lower runs first. */
  interceptPriority?: number;
  /** Has an ability that can go wrong without ever waking, for what a malfunction count can plausibly be. */
  passive?: boolean;
  /** The first choice when the Storyteller picks which Minion takes over from the Demon. */
  demonHeir?: boolean;
  /** In play, the evil team gets no Demon bluffs. */
  noBluffs?: boolean;
}

/** Something a character does by saying it in public. Offered whenever the role is on the script. */
export interface ClaimDef {
  claim: string;
  /** "Slayer shot" */
  title: string;
  /** A player each, the claimant first: "Shooter", "Target". */
  fields: readonly string[];
  /** The check before it is recorded: "{0} shoots {1}". */
  says: string;
}

/** What a role needs of autoplay, for one that can be used in it. */
export interface AutoplaySupport {
  /** What can be claimed while it is on the script. `onClaim` judges it. */
  claims?: readonly ClaimDef[];
  /** Asked at every execution while it is on the script. `survivesExecution` judges a yes. */
  execution?: string;
  /** A rule nobody enforces, told to the holder in private. */
  reminder?: string;
}

/** Why a role cannot be used in autoplay, when it is for a better reason than that nobody has said it can. */
export interface AutoplayUnfit {
  unfit: string;
}

export interface RoleDef<S = unknown> {
  id: RoleId;
  name: string;
  type: CharacterType;
  alignment: Alignment;
  abilityText: string;
  /** Made for this app, not an official character. */
  homebrew?: boolean;
  reminder?: string;
  night?: { first?: number; other?: number; note?: string };
  flags: RoleFlags;
  /** Whether autoplay can use it, and how. A role that does not say cannot be used. */
  autoplay?: true | AutoplaySupport | AutoplayUnfit;
  setupRules?: SetupRules;
  setupFields?: SetupField[];
  believes?: Believes;
  initialState(): S;
  ability: Hooks<S>;
}

export interface RoleInput<S> {
  id: RoleId;
  name: string;
  type: CharacterType;
  alignment?: Alignment;
  abilityText: string;
  homebrew?: boolean;
  reminder?: string;
  night?: { first?: number; other?: number; note?: string };
  flags?: RoleFlags;
  /** Whether autoplay can use it, and how. A role that does not say cannot be used. */
  autoplay?: true | AutoplaySupport | AutoplayUnfit;
  setupRules?: SetupRules;
  setupFields?: SetupField[];
  believes?: Believes;
  initialState?: () => S;
  ability?: Hooks<S>;
}

export const naturalAlignment = (type: CharacterType): Alignment =>
  type === 'minion' || type === 'demon' ? 'evil' : 'good';

export function defineRole<S = Record<never, never>>(input: RoleInput<S>): RoleDef {
  const def: RoleDef<S> = {
    ...input,
    alignment: input.alignment ?? naturalAlignment(input.type),
    flags: input.flags ?? {},
    initialState: input.initialState ?? (() => ({}) as S),
    ability: input.ability ?? {},
  };
  // The registry holds roles of many state types; each hook only ever sees instances made from its own role.
  return def as unknown as RoleDef;
}

/** Why an autoplay script cannot have this role, or null when it can. */
export function notInAutoplay(def: RoleDef): string | null {
  if (!def.autoplay) return 'Not made ready for autoplay yet.';
  return def.autoplay !== true && 'unfit' in def.autoplay ? def.autoplay.unfit : null;
}

/** What autoplay needs of this role. Nothing, for one it cannot use. */
export const autoplaySupport = (def: RoleDef): AutoplaySupport =>
  def.autoplay && def.autoplay !== true && !('unfit' in def.autoplay) ? def.autoplay : {};

export function roleCard(def: RoleDef): RoleCard {
  const unfit = notInAutoplay(def);
  return {
    roleId: def.id,
    name: def.name,
    type: def.type,
    abilityText: def.abilityText,
    reminder: def.reminder ?? null,
    firstNight: def.night?.first ?? null,
    otherNight: def.night?.other ?? null,
    homebrew: def.homebrew ?? false,
    ...(unfit ? { notInAutoplay: unfit } : {}),
  };
}

export interface ConditionOptions {
  until: Expiry;
  name?: string;
  data?: unknown;
}

export interface DecideInput<T extends string> {
  key: Omit<DecisionKey, 'ability'> & { ability?: string | null };
  title: string;
  description: string;
  options: readonly { id: T; label: string }[];
  default: T;
  /** Publish dawn waits for an answer; accepting all defaults leaves it unanswered. */
  required?: boolean;
}

export type Instance = AbilityInstance;
