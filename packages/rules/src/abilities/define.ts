// A role is one file: defineRole gives it display data, flags, data rules and hooks. The core only ever iterates
// ability instances and calls these hooks; it never names a role.
import type { ActionField, Alignment, CharacterType, DecisionKey, PlayerId, RoleCard, RoleId } from '@ct/protocol';
import type { AbilityInstance, Expiry } from '../model/state';
import type { AbilityCtx, HookCtx } from '../night/context';
import type { Reader } from '../derive/reader';

export type Counts = [townsfolk: number, outsiders: number, minions: number, demons: number];

/** A picker or question, before the core fills in its key and the title the holder sees. */
export interface SpecDraft {
  title?: string;
  prompt: string;
  fields: ActionField[];
  distinct?: boolean;
  allowDecline?: boolean;
  declineLabel?: string;
}

export interface DayActionDraft extends SpecDraft {
  action: string;
  /** Consequential actions go through preview and accept. Default true. */
  preview?: boolean;
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

export interface DeathInfo {
  playerId: PlayerId;
  cause: string;
  wasDemon: boolean;
  aliveBefore: number;
  demonHandover: boolean;
  /** Whether the dying player's abilities were working at that moment. */
  impairedAtDeath: boolean;
}

export type DayEventInfo =
  | { kind: 'nomination'; nominator: PlayerId; nominee: PlayerId }
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
}

export interface SetupQuery {
  /** Roles assigned or proposed. */
  roles: readonly RoleId[];
  playerCount: number;
  /** A value the Storyteller chose in this role's setup field, if any. */
  field(role: RoleId, field: string): string | null;
}

export interface SetupRules {
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
  /** The Storyteller may not put this character on a good player's bluff list, and so on. */
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
  modifyEvilInfo?(ctx: HookCtx<S>, info: EvilInfoDraft): void;
  /** Whether it wakes tonight. Default: every night in its slot; start information only when due. */
  wakes?(ctx: AbilityCtx<S>): boolean;
  /** Dead tonight, but wakes anyway. */
  wakesDead?(ctx: AbilityCtx<S>): boolean;
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
  /** A prompt raised at day was answered. */
  onPrompt?(ctx: AbilityCtx<S>, kind: string, subject: string | null, option: string): void;
  registersAs?(ctx: AbilityCtx<S>, query: RegistrationQuery): Registration | null;
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
  /** Holding this ability makes the holder the Demon. */
  holderIsDemon?: boolean;
  /** Wakes only on a night they die, and then though dead. Impairment is taken at the moment of death. */
  wakesOnNightDeath?: boolean;
  /** With wakesOnNightDeath: also acts once the order is done, for a death after its slot. */
  afterOrder?: boolean;
  /** With wakesOnNightDeath: asks the holder a question. */
  asksOnDeath?: boolean;
  /** Shown in the day screen's reminders. */
  dayReminder?: boolean;
  /** The core sends no "ability impaired" malfunction for this role: it logs its own. */
  quietImpairment?: boolean;
  /** Interception order; lower runs first. */
  interceptPriority?: number;
}

export interface RoleDef<S = unknown> {
  id: RoleId;
  name: string;
  type: CharacterType;
  alignment: Alignment;
  abilityText: string;
  reminder?: string;
  night?: { first?: number; other?: number; note?: string };
  flags: RoleFlags;
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
  reminder?: string;
  night?: { first?: number; other?: number; note?: string };
  flags?: RoleFlags;
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

export function roleCard(def: RoleDef): RoleCard {
  return {
    roleId: def.id,
    name: def.name,
    type: def.type,
    abilityText: def.abilityText,
    reminder: def.reminder ?? null,
    firstNight: def.night?.first ?? null,
    otherNight: def.night?.other ?? null,
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
}

export type Instance = AbilityInstance;
