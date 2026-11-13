// The context a hook receives, scoped to one ability instance. It exposes no raw state mutation: every change goes
// through the Run, which keeps impairment, histories and logs right.
import type { Alignment, CharacterType, PlayerId, RoleId } from '@ct/protocol';
import { Reader } from '../derive/reader';
import type { AbilityInstance, Condition, ConditionType, Holder } from '../model/state';
import type {
  ConditionOptions,
  DayActionOutcome,
  DecideInput,
  InterceptResult,
  KillAttempt,
  Registration,
  RegistrationQuery,
  SpecDraft,
} from '../abilities/define';
import { makesDemon, roleDef } from '../abilities/registry';
import { subRng, type Rng } from '../util/rng';
import { demonInfoLines } from './evil-info';
import type { Run } from './run';

export type { DayActionOutcome, InterceptResult };

/** A read-only context: derived conditions, visibility and checklists run where nothing may change. */
export class HookCtx<S> extends Reader {
  readonly ability: AbilityInstance<S>;

  constructor(r: Reader, ability: AbilityInstance<unknown>) {
    super(r.w, r.moment);
    this.ability = ability as AbilityInstance<S>;
  }

  get state(): S {
    return this.ability.state;
  }

  /** The player holding this ability. Hooks of Storyteller- or game-held abilities must not ask. */
  get holder(): PlayerId {
    const h = this.ability.holder;
    if (h.kind !== 'player') throw new Error('This ability has no player holder.');
    return h.id;
  }

  get holderKind(): Holder['kind'] {
    return this.ability.holder.kind;
  }

  /** The value the Storyteller chose in one of this role's setup fields. */
  field(field: string): string | null {
    const s = this.ability.state as { setup?: Record<string, string | null> } | undefined;
    return s?.setup?.[field] ?? null;
  }
}

export interface InformInput {
  title?: string;
  truth: string[];
  /** The false lines suggested when impaired. None means a confirmation, which has no false version. */
  falseLines?: string[] | null;
  /** Each a full set of lines the Storyteller can pick. */
  alternatives?: string[][];
}

export interface AskInput {
  /** Distinguishes several questions from one ability. Default: the player asked. */
  key?: string;
  to: PlayerId;
  spec: SpecDraft;
  /** The answer isn't the holder's own input. */
  asksOther?: boolean;
}

export interface GrantOptions {
  shownAs?: RoleId | null;
  perceivedOnly?: boolean;
  /** Gained now, so start information is due the first night it is active. */
  startInfo?: boolean;
  /** It fails whenever the ability granting it is dead or impaired, and returns when that one does. */
  whileSourceWorks?: boolean;
  state?: unknown;
}

export interface ChangeOptions {
  reason: string;
  /** 'natural' gives the new role's own alignment; default keeps the player's. */
  alignment?: 'keep' | 'natural';
  /** Default true: abilities gained from other abilities stay. */
  keepGranted?: boolean;
  /** Keep what this player's abilities caused. */
  keepTies?: boolean;
  /** The new character's start information is still due. */
  startInfo?: boolean;
  /** Changed during the walk: acts from the next night, apart from start information. */
  noActTonight?: boolean;
}

export interface KillOptions {
  unstoppable?: boolean;
  demonHandover?: boolean;
  redirected?: boolean;
}

export class AbilityCtx<S> extends HookCtx<S> {
  constructor(
    readonly run: Run,
    ability: AbilityInstance<unknown>,
  ) {
    super(run.reader, ability);
  }

  // ---- identity and time ----
  get n(): number {
    return this.moment.n;
  }

  get isNight(): boolean {
    return this.moment.kind === 'night';
  }

  get impaired(): boolean {
    return this.run.impairmentOf(this.ability).impaired;
  }

  get causes(): string[] {
    return this.run.impairmentOf(this.ability).causes;
  }

  /** The submitted choice: empty when there was none or it was declined. */
  get choice(): string[] {
    const c = this.run.choiceOf(this.ability);
    return c && !c.decline ? c.values : [];
  }

  /** Whether a choice exists, including a decline. */
  get chose(): boolean {
    return !!this.run.choiceOf(this.ability);
  }

  get startInfoDue(): boolean {
    return this.n === 0 || this.ability.startInfoPending;
  }

  /** The holder only believes in this ability: a token they drew, or one that does nothing. */
  get believed(): boolean {
    return this.isBelieved(this.ability) || this.ability.perceivedOnly;
  }

  /** Whether the holder can use this ability now: alive, or keeping it past death. */
  get canAct(): boolean {
    return this.run.canAct(this.ability, roleDef(this.ability.roleId));
  }

  /** During the night's walk, rather than a command acting on the live game. */
  get inWalk(): boolean {
    return this.run.night !== null;
  }

  /** Every instance of this role there has ever been, for a fact the role shares across holders. */
  get peers(): AbilityInstance<S>[] {
    return Object.values(this.w.abilities).filter((a) => a.roleId === this.ability.roleId) as AbilityInstance<S>[];
  }

  /** Lets a day action appear once, however many holders the role has. */
  get firstPeer(): boolean {
    return this.instances.find((a) => a.roleId === this.ability.roleId)?.id === this.ability.id;
  }

  isImpaired = (id: PlayerId): boolean => this.run.impairment(id).impaired;

  get aliveAtDuskIds(): PlayerId[] {
    return this.seated.filter(this.aliveAtDusk);
  }

  /** Alive at the start of the night. */
  aliveAtDusk = (id: PlayerId): boolean => !!this.run.start.players[id]?.life.alive;

  /** How someone died tonight, if they did. */
  deathCauseTonight = (id: PlayerId): string | null => this.run.deathCause[id] ?? null;

  /** Everyone who died tonight so far, in order. */
  get deathsTonight(): readonly PlayerId[] {
    return this.run.deaths;
  }

  get revivedTonight(): readonly PlayerId[] {
    return this.run.revived;
  }

  rng = (key: string): Rng => this.run.rng(`${this.ability.id}:${key}`);

  /**
   * Randomness that comes out the same every time it's asked in this game, for a suggestion the Storyteller sees
   * before the command that uses it (views and commands run with different seeds).
   */
  stableRng = (key: string): Rng => subRng(this.run.world.createdAt, `${this.ability.id}:${key}`);

  setState(patch: Partial<S>) {
    this.ability.state = { ...this.ability.state, ...patch };
  }

  markUsed(used = true) {
    this.ability.used = used;
  }

  // ---- questions about the world ----
  registers(subject: PlayerId, wants: RegistrationQuery['wants'] = 'alignment'): Registration {
    return this.run.registers(this.ability, subject, wants);
  }

  conditionsFrom(type?: ConditionType): Condition[] {
    return this.w.conditions.filter(
      (c) => c.source.kind === 'ability' && c.source.id === this.ability.id && (!type || c.type === type),
    );
  }

  /** Who worked abnormally since dawn: the day before this night, then tonight, with the Storyteller's adjustments. */
  malfunctionsSinceDawn(): Set<PlayerId> {
    return this.run.malfunctionsSinceDawn();
  }

  /** Whether the Storyteller has recorded a decision, without asking it (a wake rule that can be flipped early). */
  recorded(key: DecideInput<string>['key']): string | null {
    return this.run.recordedDecision(this.ability, key);
  }

  /** The other ability instance by id. */
  instance(id: string): AbilityInstance | undefined {
    return this.w.abilities[id];
  }

  /** Learned the moment an ability gives nothing back. */
  resultsFor(player: PlayerId) {
    return this.run.results.filter((r) => r.playerId === player);
  }

  actedTonight(player: PlayerId, ability: string): boolean {
    return this.run.acted.has(`${player}:${ability}`);
  }

  /** Whether a player has woken for any of their own abilities so far tonight. */
  wokeTonight(player: PlayerId): boolean {
    return [...this.run.acted].some((k) => k.startsWith(`${player}:`));
  }

  // ---- changes ----
  decide<T extends string>(input: DecideInput<T>): T {
    return this.run.decide(this.ability, input);
  }

  inform(input: InformInput) {
    this.run.inform(this.ability, input);
  }

  /** A number result: when impaired, a random other number between min and max is suggested. */
  informNumber(truth: number, min: number, max: number, fmt: (n: number) => string[], title?: string) {
    const others: number[] = [];
    const alternatives: string[][] = [];
    for (let i = min; i <= max; i++) {
      alternatives.push(fmt(i));
      if (i !== truth) others.push(i);
    }
    const fake = others.length ? this.rng('number').pick(others) : truth;
    this.inform({ truth: fmt(truth), falseLines: fmt(fake), alternatives, ...(title ? { title } : {}) });
  }

  notify(player: PlayerId, title: string, lines: string[], options: { pending?: boolean; starting?: boolean } = {}) {
    this.run.notify(player, title, lines, options);
  }

  ask(input: AskInput): string[] | null {
    return this.run.ask(this.ability, input);
  }

  attemptKill(target: PlayerId, cause: string, options: KillOptions = {}): boolean {
    return this.run.attemptKill(target, cause, this.ability, options);
  }

  /** A death nothing can stop: the Storyteller overrode the outcome. */
  forceKill(target: PlayerId, cause: string) {
    if (this.isAlive(target)) this.run.kill(target, cause);
  }

  /** Today's chosen execution, which happens at dusk: the player, if they are to die. Null with none. Day only. */
  get executeeToday(): PlayerId | null {
    if (this.moment.kind !== 'day') return null;
    const n = this.moment.n;
    const e = this.run.world.events.findLast((x) => x.kind === 'execution' && x.at.kind === 'day' && x.at.n === n);
    return e?.kind === 'execution' && e.died && e.playerId && this.isAlive(e.playerId) ? e.playerId : null;
  }

  /** Today's choice of execution as recorded (null: none recorded), whether or not it kills. Day only. */
  get executionChoiceToday(): { playerId: PlayerId | null; died: boolean } | null {
    if (this.moment.kind !== 'day') return null;
    const n = this.moment.n;
    const e = this.run.world.events.findLast((x) => x.kind === 'execution' && x.at.kind === 'day' && x.at.n === n);
    return e?.kind === 'execution' ? { playerId: e.playerId, died: e.died } : null;
  }

  /**
   * Makes a player today's execution (replacing any earlier choice), or none with null. They are executed at dusk. Day
   * only.
   */
  execute(target: PlayerId | null, died = true) {
    this.run.recordExecution(target, target !== null && died);
  }

  revive(player: PlayerId, reason: string): boolean {
    return this.run.revive(player, reason);
  }

  addCondition(target: PlayerId, type: ConditionType, options: ConditionOptions): Condition {
    return this.run.addCondition(this.ability, target, type, options);
  }

  removeCondition(condition: Condition) {
    this.run.removeCondition(condition.id);
  }

  grant(to: PlayerId, role: RoleId, options: GrantOptions = {}): AbilityInstance {
    return this.run.grant({ kind: 'player', id: to }, role, { kind: 'granted', by: this.ability.id }, options);
  }

  revoke(id: string) {
    this.run.revoke(id);
  }

  /** Move an ability to another player. */
  move(id: string, to: PlayerId) {
    this.run.move(id, to);
  }

  /** Gives an ability a fresh start, as if just gained. */
  refresh(id: string) {
    this.run.refresh(id);
  }

  /** Keeps this ability in the game, held by nobody, once its holder loses it. */
  grantToGame(role: RoleId, used: boolean, state: unknown) {
    const a = this.run.grant({ kind: 'game' }, role, { kind: 'storyteller' }, { state });
    a.used = used;
  }

  /** What an earlier ability caused now depends on this one. */
  adoptConditions(from: string) {
    this.run.adoptConditions(from, this.ability.id);
  }

  /** Drops messages queued for the next night, when what they announce has changed. */
  dropPending(player: PlayerId, titleStart: string) {
    const w = this.w;
    w.pendingNotices = w.pendingNotices.filter((n) => n.playerId !== player || !n.title.startsWith(titleStart));
  }

  /** The lines a new Demon is told. */
  demonInfo(player: PlayerId): string[] {
    return demonInfoLines(this.run, player);
  }

  /** Whether a player made a real choice tonight with an ability they only believe they have. */
  believedChose(player: PlayerId): boolean {
    return this.abilitiesOf(player).some((a) => {
      if (!this.isBelieved(a) || !this.run.acted.has(`${player}:${a.roleId}`)) return false;
      const c = this.run.choiceOf(a);
      return !!c && !c.decline;
    });
  }

  changeCharacter(target: PlayerId, role: RoleId, options: ChangeOptions) {
    this.run.changeCharacter(target, role, options);
  }

  /** False when an ability stopped it. */
  changeAlignment(target: PlayerId, alignment: Alignment, reason: string): boolean {
    return this.run.changeAlignment(target, alignment, reason);
  }

  swapSeats(a: PlayerId, b: PlayerId) {
    this.run.swapSeats(a, b);
  }

  /** A dead player gets their vote token back. */
  restoreGhostVote(player: PlayerId) {
    const p = this.w.players[player];
    if (p) p.life.ghostVoteUsed = false;
  }

  /** Record that a player's ability worked abnormally. */
  malfunction(player: PlayerId, cause: string, detail: string) {
    this.run.addMalfunction(player, cause, detail);
  }

  /** Record a malfunction only when another character caused the impairment. */
  malfunctionIfExternal(detail: string, player: PlayerId = this.holder) {
    if (this.believed) return;
    this.run.malfunctionIfExternal(player, detail);
  }

  suggestGameEnd(key: string, winner: Alignment | null, reason: string) {
    this.run.suggestGameEnd(key, winner, reason);
  }

  /** Stop the core's or another role's suggestion (a role that changes when the game ends). */
  suppressGameEnd(key: string) {
    this.run.suppressGameEnd(key);
  }

  outcome(text: string) {
    this.run.outcome(text);
  }

  /** Pass false to end it, for an ability regained only for a while. */
  keepAbilityWhenDead(player: PlayerId, keep = true) {
    for (const a of this.abilitiesOf(player)) a.survivesDeath = keep;
  }

  /** Raise a question for the Storyteller that resolves later, through onPrompt. Day only. */
  prompt(input: {
    kind: string;
    subject?: string | null;
    title: string;
    description: string;
    options: { id: string; label: string }[];
  }) {
    this.run.prompt(this.ability, input);
  }

  /** Abilities of a type on the script, for a role that offers them. */
  charactersOfType = (t: CharacterType): RoleId[] => this.scriptOfType(t);

  /** Fires a jinx extension point for this ability's role, if a jinx in play adds one. */
  jinx<K extends JinxPoint>(point: K, extra?: RoleId): JinxReply<K> {
    return this.run.jinx(this, point, extra) as JinxReply<K>;
  }

  /** The Demon a hand-over must copy: the ability that makes `player` the Demon, or their character. */
  demonSource(player: PlayerId): { kind: 'ability'; id: string } | { kind: 'character'; role: RoleId } | null {
    const token = this.abilitiesOf(player).find(makesDemon);
    if (token) return { kind: 'ability', id: token.id };
    const c = this.character(player);
    return c ? { kind: 'character', role: c } : null;
  }
}

export type JinxPoint =
  'onGain' | 'beforeMalfunctionCount' | 'replaceResolve' | 'afterRevive' | 'wakesDead' | 'replacePicker';
export type JinxReply<K extends JinxPoint> = K extends 'afterRevive'
  ? PlayerId | null
  : K extends 'replacePicker'
    ? SpecDraft | null
    : boolean;

export type { KillAttempt };
