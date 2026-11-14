// One pass of the engine over a world. At night it walks the order on a clone and returns a Resolution, a pure function
// of the stored game. By day it works directly on the command's draft, so a day event fires the same hooks.
import type {
  ActionSpec,
  ActorRow,
  Choice,
  DecisionKey,
  Malfunction,
  PlayerId,
  ReviewItem,
  RoleId,
} from '@ct/protocol';
import type {
  ConditionOptions,
  DecideInput,
  InfoDraft,
  Instance,
  KillAttempt,
  RegistrationQuery,
  RoleDef,
  SpecDraft,
} from '../abilities/define';
import { allJinxes, nightSheet, roleDef } from '../abilities/registry';
import { externalImpairment, computeImpairment, type Impairment } from '../derive/impairment';
import { Reader } from '../derive/reader';
import type { Condition, ConditionType, GameState, Holder, Moment, NightPhase, Origin } from '../model/state';
import { subRng, type Rng } from '../util/rng';
import {
  AbilityCtx,
  type AskInput,
  type ChangeOptions,
  type GrantOptions,
  type InformInput,
  type JinxPoint,
  type KillOptions,
} from './context';

export interface ResultRow {
  key: string;
  playerId: PlayerId;
  roleId: RoleId;
  title: string;
  truth: string[];
  suggested: string[];
  transformed: string[] | null;
  final: string[];
  impaired: boolean;
  causes: string[];
  overridden: boolean;
  staleOverride: boolean;
  alternatives: string[][];
  /** Only confirms a choice: it has no false version. */
  confirmation: boolean;
}

export interface QuestionRow {
  key: string;
  playerId: PlayerId;
  roleId: RoleId;
  spec: ActionSpec;
  answered: boolean;
  answer: Choice | null;
}

export interface Resolution {
  actors: ActorRow[];
  results: ResultRow[];
  decisions: ReviewItem[];
  questions: QuestionRow[];
  notices: { playerId: PlayerId; title: string; lines: string[] }[];
  deaths: PlayerId[];
  revived: PlayerId[];
  malfunctions: Malfunction[];
  gameEnd: { key: string; winner: 'good' | 'evil' | null; reason: string }[];
  log: string[];
  /** The world after the night, committed at dawn. */
  after: GameState;
}

export const hashDecision = (n: number, key: DecisionKey): string =>
  [n, key.kind, key.ability ?? '', key.subject ?? '', key.detail ?? ''].join('|');

export interface RunOptions {
  world: GameState;
  moment: Moment;
  seed: number;
  now: number;
  /** The start of the night, for hooks that ask about dusk. Default: the world itself. */
  start?: GameState;
  night?: NightPhase;
  /** Decisions supplied with a day command, by hash. */
  dayDecisions?: Record<string, string>;
}

export class Run {
  private attempts = new Map<string, number>();
  readonly world: GameState;
  readonly reader: Reader;
  readonly start: GameState;
  readonly night: NightPhase | null;
  readonly now: number;
  readonly seed: number;
  private readonly dayDecisions: Record<string, string>;

  readonly results: ResultRow[] = [];
  readonly decisions = new Map<string, ReviewItem>();
  readonly actors: ActorRow[] = [];
  readonly questions: QuestionRow[] = [];
  readonly notices: { playerId: PlayerId; title: string; lines: string[] }[] = [];
  readonly deaths: PlayerId[] = [];
  readonly revived: PlayerId[] = [];
  readonly malfunctions: Malfunction[] = [];
  readonly gameEnd = new Map<string, { key: string; winner: 'good' | 'evil' | null; reason: string }>();
  readonly suppressed = new Set<string>();
  readonly log: string[] = [];
  readonly deathCause: Record<string, string> = {};
  readonly acted = new Set<string>();
  /** Given a new role tonight: they act from the next night, except for start information. */
  readonly noActTonight = new Set<PlayerId>();
  private readonly impairAtDeath: Record<string, Impairment> = {};
  private impairCache: Record<string, Impairment> | null = null;
  private currentRow: ActorRow | null = null;
  private currentChoice = new Map<string, Choice | null>();
  private readonly chosenThisRun = new Set<string>();
  /** Resolving the night, rather than answering who is asked to submit. */
  private walking = false;
  /** The ability on its second act tonight, which keeps its results and decisions apart from the first. */
  private acting: string | null = null;

  constructor(o: RunOptions) {
    this.world = o.world;
    this.reader = new Reader(o.world, o.moment);
    this.start = o.start ?? o.world;
    this.night = o.night ?? null;
    this.now = o.now;
    this.seed = o.seed;
    this.dayDecisions = o.dayDecisions ?? {};
  }

  get moment() {
    return this.reader.moment;
  }

  get n() {
    return this.moment.n;
  }

  get isNight() {
    return this.moment.kind === 'night';
  }

  rng(key: string): Rng {
    return subRng(this.seed, key);
  }

  ctx<S = unknown>(a: Instance): AbilityCtx<S> {
    return new AbilityCtx<S>(this, a);
  }

  // ---- impairment ----
  private dirty() {
    this.impairCache = null;
  }

  impairment(player: PlayerId): Impairment {
    this.impairCache ??= computeImpairment(this.world, this.moment);
    return this.impairCache[player] ?? { impaired: false, causes: [] };
  }

  impairmentOf(a: Instance): Impairment {
    if (a.holder.kind !== 'player') return { impaired: false, causes: [] };
    if (a.tiedToSource && a.origin.kind === 'granted' && !this.sourceWorks(a.origin.by)) {
      return { impaired: true, causes: [...this.impairment(a.holder.id).causes, 'source not working'] };
    }
    if (roleDef(a.roleId).flags.wakesOnNightDeath) {
      const at = this.impairAtDeath[a.holder.id];
      if (at) return at;
    }
    const imp = this.impairment(a.holder.id);
    return a.perceivedOnly ? { impaired: true, causes: [...imp.causes, 'perceived only'] } : imp;
  }

  private sourceWorks(id: string): boolean {
    const source = this.world.abilities[id];
    if (!source || source.activeUntil === 'removed') return false;
    return (
      source.holder.kind !== 'player' || (this.reader.isAlive(source.holder.id) && !this.impairmentOf(source).impaired)
    );
  }

  // ---- decisions ----
  private hash(a: Instance | null, key: DecideInput<string>['key']): { hash: string; full: DecisionKey } {
    const again = !!a && this.acting === a.id;
    const full: DecisionKey = {
      kind: key.kind,
      ability: (key.ability === undefined ? (a?.id ?? null) : key.ability) as DecisionKey['ability'],
      subject: key.subject ?? null,
      detail: again ? `${key.detail ?? ''}:again` : (key.detail ?? null),
    };
    return { hash: hashDecision(this.n, full), full };
  }

  recordedDecision(a: Instance, key: DecideInput<string>['key']): string | null {
    const { hash } = this.hash(a, key);
    return this.night?.decisions[hash]?.option ?? this.dayDecisions[hash] ?? null;
  }

  decide<T extends string>(a: Instance | null, input: DecideInput<T>): T {
    const { hash, full } = this.hash(a, input.key);
    const raw = this.night?.decisions[hash]?.option ?? this.dayDecisions[hash];
    const valid = input.options.some((o) => o.id === raw);
    this.decisions.set(hash, {
      key: full,
      hash,
      title: input.title,
      description: input.description,
      options: input.options.map((o) => ({ id: o.id, label: o.label })),
      default: input.default,
      chosen: valid ? (raw as string) : null,
      stale: false,
      required: !!input.required,
    });
    return valid ? (raw as T) : input.default;
  }

  /** Decisions the Storyteller recorded that this run no longer asks. */
  private staleDecisions(): ReviewItem[] {
    if (!this.night) return [];
    const out: ReviewItem[] = [];
    for (const [hash, d] of Object.entries(this.night.decisions)) {
      const asked = this.decisions.get(hash);
      if (!asked) {
        out.push({
          key: d.key,
          hash,
          title: 'This decision no longer applies',
          description: `${d.key.kind}: recorded "${d.option}".`,
          options: [],
          default: d.option,
          chosen: d.option,
          stale: true,
          required: false,
        });
      } else if (asked.chosen === null) {
        asked.stale = true;
      }
    }
    return out;
  }

  // ---- output ----
  outcome(text: string) {
    const row = this.currentRow;
    if (row) row.outcome = row.outcome ? `${row.outcome}; ${text}` : text;
    this.log.push(text);
  }

  addMalfunction(playerId: PlayerId, cause: string, detail: string) {
    this.malfunctions.push({ playerId, cause, detail });
  }

  malfunctionIfExternal(player: PlayerId, detail: string) {
    const ext = externalImpairment(this.world, this.moment, player);
    if (ext.length) this.addMalfunction(player, ext.join(','), detail);
  }

  malfunctionsSinceDawn(): Set<PlayerId> {
    const set = new Set<PlayerId>();
    for (const e of this.world.events) {
      if (e.kind === 'malfunction' && e.at.kind === 'day' && e.at.n === this.n) set.add(e.playerId);
    }
    for (const m of this.malfunctions) set.add(m.playerId);
    for (const p of this.night?.malfunctionAdjust.add ?? []) set.add(p);
    for (const p of this.night?.malfunctionAdjust.remove ?? []) set.delete(p);
    return set;
  }

  suggestGameEnd(key: string, winner: 'good' | 'evil' | null, reason: string) {
    this.gameEnd.set(key, { key, winner, reason });
  }

  suppressGameEnd(key: string) {
    this.suppressed.add(key);
  }

  notify(player: PlayerId, title: string, lines: string[], options: { pending?: boolean; starting?: boolean } = {}) {
    if (options.pending) {
      this.world.pendingNotices.push({ playerId: player, title, lines });
      return;
    }
    if (this.night && !options.starting) {
      this.notices.push({ playerId: player, title, lines });
      return;
    }
    this.deliver(player, options.starting ? 'starting' : 'notice', title, lines);
  }

  deliver(player: PlayerId, kind: 'starting' | 'result' | 'notice', title: string, lines: string[]) {
    const w = this.world;
    const list = (w.inbox[player] ??= []);
    list.push({ id: `m${w.idSeq++}`, n: this.n, kind, title, lines });
  }

  private shownTitle(a: Instance, title?: string): string {
    const def = roleDef(a.roleId);
    const given = title ?? def.name;
    return a.shownAs && a.shownAs !== a.roleId ? roleDef(a.shownAs).name : given;
  }

  inform(a: Instance, input: InformInput) {
    if (a.holder.kind !== 'player') return;
    const imp = this.impairmentOf(a);
    const falseLines = input.falseLines ?? null;
    const suggested = imp.impaired && falseLines ? falseLines : input.truth;
    const key = this.acting === a.id ? `${a.id}:again` : (a.id as string);
    const override = this.night?.overrides[key];
    this.results.push({
      key,
      playerId: a.holder.id,
      roleId: a.roleId,
      title: this.shownTitle(a, input.title),
      truth: input.truth,
      suggested,
      transformed: null,
      final: override?.lines ?? suggested,
      impaired: imp.impaired,
      causes: imp.causes,
      overridden: !!override,
      staleOverride: !!override && override.writtenAgainst.join('\n') !== input.truth.join('\n'),
      alternatives: input.alternatives ?? [],
      confirmation: !falseLines,
    });
  }

  fullSpec(a: Instance, key: string, draft: SpecDraft): ActionSpec {
    const fields = draft.fields;
    const players = fields.filter((f) => f.kind === 'player');
    const pool = new Set(players.flatMap((f) => f.options));
    const stuck = fields.some((f) => f.options.length === 0) || (!!draft.distinct && pool.size < players.length);
    const allowDecline = !!draft.allowDecline || stuck;
    return {
      key,
      roleId: a.shownAs,
      title: this.shownTitle(a, draft.title),
      prompt: draft.prompt,
      fields,
      distinct: !!draft.distinct,
      allowDecline,
      ...(draft.declineLabel || stuck ? { declineLabel: draft.declineLabel ?? 'No legal choice' } : {}),
    };
  }

  ask(a: Instance, input: AskInput): string[] | null {
    const key = `${a.id}:${input.key ?? input.to}`;
    const answer = this.night?.answers[key];
    const spec = this.fullSpec(a, key, input.spec);
    // Nobody but the holder sees the name behind a hidden ability; others see the role by its own name.
    const shown = input.to === (a.holder.kind === 'player' ? a.holder.id : null) ? spec : { ...spec, roleId: a.roleId };
    this.questions.push({
      key,
      playerId: input.to,
      roleId: a.roleId,
      spec: shown,
      answered: !!answer,
      answer: answer?.choice ?? null,
    });
    if (!answer) return null;
    if (this.currentRow && !input.asksOther) this.currentRow.input = this.describe(answer.choice);
    return answer.choice.decline ? [] : answer.choice.values;
  }

  describe(c: Choice | null): string {
    if (!c) return '(no input)';
    if (c.decline) return 'declined / no one';
    return c.values.map((v) => (this.reader.has(v) ? this.reader.name(v) : this.reader.roleName(v))).join(', ');
  }

  // ---- conditions ----
  addCondition(a: Instance, target: PlayerId, type: ConditionType, o: ConditionOptions): Condition {
    const w = this.world;
    const c: Condition = {
      id: `c${w.idSeq++}` as Condition['id'],
      type,
      target,
      source: { kind: 'ability', id: a.id },
      until: o.until,
      since: this.moment,
      ...(o.name !== undefined ? { name: o.name } : {}),
      ...(o.data !== undefined ? { data: o.data } : {}),
    };
    w.conditions.push(c);
    this.dirty();
    return c;
  }

  removeCondition(id: string) {
    this.world.conditions = this.world.conditions.filter((c) => c.id !== id);
    this.dirty();
  }

  adoptConditions(from: string, to: string) {
    for (const c of this.world.conditions) {
      if (c.source.kind === 'ability' && c.source.id === from) c.source = { kind: 'ability', id: to as Instance['id'] };
    }
    this.dirty();
  }

  // ---- abilities ----
  grant(holder: Holder, role: RoleId, origin: Origin, options: GrantOptions = {}): Instance {
    const w = this.world;
    const def = roleDef(role);
    const a: Instance = {
      id: `a${w.idSeq++}` as Instance['id'],
      roleId: role,
      holder,
      origin,
      shownAs: options.shownAs === undefined ? role : options.shownAs,
      perceivedOnly: !!options.perceivedOnly,
      activeFrom: this.moment,
      activeUntil: null,
      used: false,
      startInfoPending: !!options.startInfo && !!def.flags.startInfo,
      tiedToSource: !!options.whileSourceWorks,
      survivesDeath: false,
      state: options.state ?? def.initialState(),
    };
    w.abilities[a.id] = a;
    this.dirty();
    def.ability.setup?.(this.ctx(a));
    return this.world.abilities[a.id] as Instance;
  }

  /** Ends an ability, what depends on it, and anything gained through it. Timed conditions run their full time. */
  revoke(id: string, keepTies = false) {
    const a = this.world.abilities[id];
    if (!a || a.activeUntil === 'removed') return;
    a.activeUntil = 'removed';
    if (!keepTies) {
      this.world.conditions = this.world.conditions.filter(
        (c) => !(c.source.kind === 'ability' && c.source.id === id && c.until !== 'dusk'),
      );
    }
    for (const other of Object.values(this.world.abilities)) {
      if (other.origin.kind === 'granted' && other.origin.by === id) this.revoke(other.id, keepTies);
    }
    this.dirty();
  }

  move(id: string, to: PlayerId) {
    const a = this.world.abilities[id];
    if (!a) return;
    a.holder = { kind: 'player', id: to };
    this.dirty();
  }

  /** Character-origin abilities come from the character and any token the player thinks they are. */
  private buildCharacterAbilities(player: PlayerId, role: RoleId | null, startInfo: boolean, survivesDeath = false) {
    if (!role) return;
    const def = roleDef(role);
    const holder: Holder = { kind: 'player', id: player };
    const a = this.grant(holder, role, { kind: 'character' }, { startInfo, shownAs: def.believes ? null : role });
    a.survivesDeath = survivesDeath;
  }

  changeCharacter(target: PlayerId, role: RoleId | null, o: ChangeOptions) {
    const w = this.world;
    const p = this.reader.player(target);
    const from = p.character;
    const mine = Object.values(w.abilities).filter(
      (a) => a.holder.kind === 'player' && a.holder.id === target && a.activeUntil !== 'removed',
    );
    const keepGranted = o.keepGranted ?? true;
    const survives = keepGranted && mine.some((a) => a.survivesDeath);
    for (const a of mine) {
      if (a.origin.kind !== 'character') continue;
      roleDef(a.roleId).ability.onCharacterChange?.(this.ctx(a), { from, to: role });
    }
    for (const a of mine) {
      if (a.origin.kind === 'character' || !keepGranted) this.revoke(a.id, !!o.keepTies);
    }
    p.history.push({ kind: 'character', at: this.moment, from, to: role, reason: o.reason });
    p.character = role;
    p.self.character = role && roleDef(role).believes ? null : role;
    delete w.setup.bag[target];
    const natural = role ? roleDef(role).alignment : 'good';
    if (o.alignment === 'natural' && !this.alignmentGuarded(target, natural, o.reason)) {
      p.alignment = natural;
      p.self.alignment = p.alignment;
    }
    this.buildCharacterAbilities(target, role, !!o.startInfo, survives);
    if (o.noActTonight) this.noActTonight.add(target);
    this.dirty();
    if (!role) return;
    for (const a of this.reader.instances) {
      roleDef(a.roleId).ability.observeCharacterChange?.(this.ctx(a), { playerId: target, from, to: role });
    }
  }

  /** The token a player drew: they think they are this. Its ability is real but impaired by their character. */
  setBelieved(player: PlayerId, role: RoleId | null) {
    const w = this.world;
    const p = this.reader.player(player);
    const def = p.character ? roleDef(p.character) : null;
    for (const a of Object.values(w.abilities)) {
      if (a.holder.kind !== 'player' || a.holder.id !== player) continue;
      if (a.origin.kind === 'character' && a.roleId !== p.character) this.revoke(a.id);
    }
    if (role) {
      w.setup.bag[player] = role;
      p.self.character = role;
      p.self.alignment = roleDef(role).alignment;
      this.grant(
        { kind: 'player', id: player },
        role,
        { kind: 'character' },
        {
          perceivedOnly: !!def?.believes?.perceivedOnly,
        },
      );
    } else {
      delete w.setup.bag[player];
      p.self.character = null;
      p.self.alignment = p.alignment;
    }
  }

  private alignmentGuarded(target: PlayerId, to: 'good' | 'evil', reason: string): boolean {
    if (this.reader.player(target).alignment === to) return false;
    return this.reader.instances.some((a) =>
      roleDef(a.roleId).ability.guardsAlignment?.(this.ctx(a), { target, to, reason }),
    );
  }

  /** False when an ability stopped it. */
  changeAlignment(target: PlayerId, alignment: 'good' | 'evil', reason: string): boolean {
    const p = this.reader.player(target);
    if (this.alignmentGuarded(target, alignment, reason)) {
      this.outcome(`${this.reader.name(target)} stays ${p.alignment}`);
      return false;
    }
    p.history.push({ kind: 'alignment', at: this.moment, from: p.alignment, to: alignment, reason });
    p.alignment = alignment;
    p.self.alignment = alignment;
    return true;
  }

  /** Two players change places, and everything that reads the seats follows. */
  swapSeats(a: PlayerId, b: PlayerId) {
    const w = this.world;
    const swap = <T>(list: T[], x: number, y: number) => {
      if (x >= 0 && y >= 0) [list[x], list[y]] = [list[y] as T, list[x] as T];
    };
    swap(
      w.seats,
      w.seats.findIndex((s) => s.playerId === a),
      w.seats.findIndex((s) => s.playerId === b),
    );
    swap(w.publishedSeating, w.publishedSeating.indexOf(a), w.publishedSeating.indexOf(b));
    this.dirty();
  }

  // ---- registration ----
  registers(asker: Instance, subject: PlayerId, wants: RegistrationQuery['wants']) {
    const r = this.reader;
    const character = r.character(subject) ?? asker.roleId;
    const truthful = {
      character,
      type: r.isDemon(subject) ? ('demon' as const) : roleDef(character).type,
      alignment: r.alignmentOf(subject),
      alive: r.isAlive(subject),
    };
    const name = roleDef(asker.roleId).name;
    const query: RegistrationQuery = {
      asker: { player: asker.holder.kind === 'player' ? asker.holder.id : null, ability: asker.id, name },
      wants,
    };
    for (const a of r.abilitiesOf(subject)) {
      const hook = roleDef(a.roleId).ability.registersAs;
      if (!hook) continue;
      const answer = hook(this.ctx(a), query);
      if (answer) return answer;
    }
    for (const a of r.instances) {
      const answer = roleDef(a.roleId).ability.registersOther?.(this.ctx(a), subject, query);
      if (answer) return answer;
    }
    return truthful;
  }

  // ---- kills ----
  private interceptors(): Instance[] {
    const prio = (a: Instance) => roleDef(a.roleId).flags.interceptPriority ?? 50;
    return this.reader.instances
      .filter((a) => roleDef(a.roleId).ability.interceptKill)
      .sort((a, b) => prio(a) - prio(b));
  }

  attemptKill(target: PlayerId, cause: string, source: Instance | null, o: KillOptions = {}): boolean {
    const r = this.reader;
    const p = this.world.players[target];
    if (!p || !p.life.alive) {
      this.outcome(`${r.name(target)} is already dead`);
      return false;
    }
    const attacker = source?.holder.kind === 'player' ? source.holder.id : null;
    const kill: KillAttempt = {
      target,
      cause,
      attacker,
      attackerAbility: source?.id ?? null,
      unstoppable: !!o.unstoppable,
      redirected: !!o.redirected,
      demonHandover: !!o.demonHandover,
    };
    for (const a of this.interceptors()) {
      const result = roleDef(a.roleId).ability.interceptKill!(this.ctx(a), kill);
      if (result === 'prevent') return false;
      if (result !== 'pass') {
        this.attemptKill(result.redirect, cause, source, { ...o, redirected: true });
        return false;
      }
    }
    this.kill(target, cause, !!o.demonHandover);
    return true;
  }

  /** Unconditional death plus triggers. */
  kill(target: PlayerId, cause: string, demonHandover = false) {
    const r = this.reader;
    const p = r.player(target);
    const aliveBefore = r.aliveResidents.length;
    const wasDemon = r.isDemon(target);
    const imp = this.impairment(target);
    this.impairAtDeath[target] = imp;
    p.life.alive = false;
    p.life.diedAt = this.moment;
    p.life.cause = cause;
    this.deathCause[target] = cause;
    this.deaths.push(target);
    this.dirty();
    this.outcome(`${r.name(target)} dies (${cause.replaceAll('_', ' ')})`);
    if (!this.isNight) {
      this.world.events.push({ kind: 'death', at: this.moment, playerId: target, cause });
      this.deliver(target, 'notice', 'You have died', [
        'You are dead. Keep your eyes closed at night unless your ability says otherwise.',
      ]);
    }
    const death = { playerId: target, cause, wasDemon, aliveBefore, demonHandover, impairedAtDeath: imp.impaired };
    for (const a of r.instances) roleDef(a.roleId).ability.onDeath?.(this.ctx(a), death);
  }

  revive(player: PlayerId, reason: string): boolean {
    const r = this.reader;
    const p = this.world.players[player];
    if (!p || p.life.alive) return false;
    p.life = { alive: true, diedAt: null, cause: null, ghostVoteUsed: false };
    for (const a of r.abilitiesOf(player)) a.survivesDeath = false;
    this.revived.push(player);
    delete this.deathCause[player];
    this.dirty();
    this.outcome(`${r.name(player)} is alive again (${reason})`);
    if (!this.isNight) {
      this.world.events.push({ kind: 'revival', at: this.moment, playerId: player });
      this.deliver(player, 'notice', 'You are alive again', ['You have been brought back to life.']);
    }
    for (const a of r.instances) roleDef(a.roleId).ability.onRevive?.(this.ctx(a), player);
    for (const a of r.instances) this.jinx(this.ctx(a), 'afterRevive');
    return true;
  }

  // ---- jinxes ----
  jinx(ctx: AbilityCtx<unknown>, point: JinxPoint, extra?: RoleId): boolean | PlayerId | SpecDraft | null {
    for (const j of allJinxes()) {
      const hook = j.hooks?.[point];
      if (!hook) continue;
      const other = extra ?? (ctx.ability.roleId === j.a ? j.b : ctx.ability.roleId === j.b ? j.a : null);
      if (!other || !((j.a === ctx.ability.roleId && j.b === other) || (j.b === ctx.ability.roleId && j.a === other))) {
        continue;
      }
      const reply = (
        hook as (c: AbilityCtx<unknown>, role: RoleId) => boolean | PlayerId | SpecDraft | null | undefined
      )(ctx, other);
      if (reply) return reply;
    }
    return point === 'afterRevive' || point === 'replacePicker' ? null : false;
  }

  /**
   * Records today's execution, replacing any earlier record from today. Until dusk, `died` says whether the player
   * is to die; at dusk the execution happens and it says whether they did.
   */
  recordExecution(playerId: PlayerId | null, died: boolean) {
    const w = this.world;
    const n = this.moment.n;
    w.events = w.events.filter((e) => !(e.kind === 'execution' && e.at.kind === 'day' && e.at.n === n));
    w.events.push({ kind: 'execution', at: this.moment, playerId, died });
  }

  // ---- prompts ----
  prompt(
    a: Instance,
    input: {
      kind: string;
      subject?: string | null;
      title: string;
      description: string;
      options: { id: string; label: string }[];
    },
  ) {
    const w = this.world;
    w.prompts.push({
      id: `q${w.idSeq++}`,
      ability: a.id,
      kind: input.kind,
      subject: input.subject ?? null,
      title: input.title,
      description: input.description,
      options: input.options,
    });
  }

  // ---- the night walk ----
  choiceOf(a: Instance): Choice | null {
    if (this.currentChoice.has(a.id)) return this.currentChoice.get(a.id) ?? null;
    if (a.holder.kind !== 'player' || !this.night) return null;
    return this.night.submissions[a.holder.id]?.actions[a.id] ?? null;
  }

  /** Whether this instance would wake right now; the same rule for the wake list and the walk. */
  wakesNow(a: Instance, def: RoleDef): boolean {
    if (this.walking && this.wakeStopped(a, def)) return false;
    const c = this.ctx(a);
    if (def.ability.wakes) return def.ability.wakes(c);
    if (def.flags.startInfo) return c.startInfoDue;
    return true;
  }

  private slot(def: RoleDef): number {
    return (this.n === 0 ? def.night?.first : def.night?.other) ?? Infinity;
  }

  /** Stoppers act earlier in the order, so this always ends, and the answer never depends on what comes after. */
  private wakeStopped(a: Instance, def: RoleDef): boolean {
    return this.reader.instances.some((s) => {
      const stopper = roleDef(s.roleId);
      if (!stopper.ability.stopsWaking || s.id === a.id || this.slot(stopper) >= this.slot(def)) return false;
      if (!this.canAct(s, stopper) || this.impairmentOf(s).impaired || !this.wakesNow(s, stopper)) return false;
      return stopper.ability.stopsWaking(this.ctx(s), a, def);
    });
  }

  actorsFor(def: RoleDef): Instance[] {
    const r = this.reader;
    const out: Instance[] = [];
    for (const pid of r.seated) {
      const held = r.abilitiesOf(pid).filter((x) => x.roleId === def.id);
      const a = held.find((x) => this.wakesNow(x, def));
      if (!a) continue;
      const ctx = this.ctx(a);
      if (def.flags.wakesOnNightDeath) {
        if (!this.deaths.includes(pid) || r.isAlive(pid)) continue;
      } else {
        if (this.noActTonight.has(pid) && !a.startInfoPending) continue;
        if (!this.canAct(a, def) && !def.ability.wakesDead?.(ctx)) continue;
      }
      const choice = def.flags.wakesOnNightDeath ? null : this.choiceOf(a);
      // No question ever goes to a player revived tonight: an ability that needs input starts next night.
      if (this.revived.includes(pid) && !choice && (def.flags.asksOnDeath || def.ability.picker?.(ctx))) continue;
      out.push(a);
    }
    for (const a of r.instances) {
      if (a.roleId === def.id && a.holder.kind !== 'player' && this.wakesNow(a, def)) out.push(a);
    }
    return out;
  }

  canAct(a: Instance, def: RoleDef): boolean {
    if (a.holder.kind !== 'player') return true;
    return this.reader.isAlive(a.holder.id) || a.survivesDeath || !!def.flags.worksWhileDead;
  }

  private wakesAgain(a: Instance): boolean {
    return this.reader.instances.some((x) => roleDef(x.roleId).ability.wakesTwice?.(this.ctx(x), a));
  }

  private act(def: RoleDef, a: Instance, again = false) {
    const pid = a.holder.kind === 'player' ? a.holder.id : null;
    if (again) this.currentChoice.set(a.id, null);
    const choice = def.flags.wakesOnNightDeath ? null : this.choiceOf(a);
    const row: ActorRow = {
      slot: def.name,
      playerId: pid ?? ('storyteller' as PlayerId),
      roleId: a.roleId,
      input: this.describe(choice),
      impaired: false,
      causes: [],
      outcome: '',
    };
    this.actors.push(row);
    this.currentRow = row;
    this.acted.add(`${pid}:${a.roleId}`);
    this.currentChoice.set(a.id, choice);
    try {
      if (again) this.acting = a.id;
      if (this.lateInputPending(def, a, row, again)) return;
      this.fireChosen(a);
      const imp = this.impairmentOf(a);
      row.impaired = imp.impaired;
      row.causes = imp.causes;
      const declined = this.choiceOf(a)?.decline;
      if (pid && imp.impaired && !declined && !def.flags.wakesOnNightDeath && !def.flags.quietImpairment) {
        this.malfunctionIfExternal(pid, `${def.name} ability impaired`);
      }
      const ctx = this.ctx(a);
      if (!this.jinx(ctx, 'replaceResolve')) def.ability.resolve?.(ctx);
      if (a.startInfoPending && def.flags.startInfo) a.startInfoPending = false;
    } finally {
      this.currentRow = null;
      this.acting = null;
    }
  }

  /** An ability gained after collecting closed has no submission, so it asks now, as a question. */
  private lateInputPending(def: RoleDef, a: Instance, row: ActorRow, again = false): boolean {
    if (this.choiceOf(a) || def.flags.wakesOnNightDeath || !(again || this.isGainedTonight(a))) return false;
    const draft = def.ability.picker?.(this.ctx(a));
    if (!draft || a.holder.kind !== 'player') return false;
    const pid = a.holder.id;
    const key = `${a.id}:${again ? 'again' : 'late'}`;
    const answer = this.night?.answers[key];
    const spec = this.fullSpec(a, key, draft);
    this.questions.push({
      key,
      playerId: pid,
      roleId: a.roleId,
      spec,
      answered: !!answer,
      answer: answer?.choice ?? null,
    });
    if (answer) {
      this.currentChoice.set(a.id, answer.choice);
      row.input = this.describe(answer.choice);
      return false;
    }
    row.outcome = `waiting for ${this.reader.name(pid)}'s choice`;
    return true;
  }

  private isGainedTonight(a: Instance): boolean {
    return a.activeFrom.kind === 'night' && a.activeFrom.n === this.n && !this.start.abilities[a.id];
  }

  /** The chosen players' abilities hear about it (the first to choose the Goon...). */
  private fireChosen(a: Instance) {
    const c = this.choiceOf(a);
    if (!c || c.decline || a.holder.kind !== 'player') return;
    const chooser = a.holder.id;
    for (const v of c.values) {
      if (!this.reader.has(v) || v === chooser) continue;
      for (const held of this.reader.abilitiesOf(v)) {
        const hook = roleDef(held.roleId).ability.onChosen;
        if (hook) hook(this.ctx(held), { player: chooser, ability: a.id });
      }
    }
  }

  /** Gives an ability a fresh start: unused, with its start information due again. */
  refresh(id: string) {
    const a = this.world.abilities[id];
    if (!a) return;
    a.used = false;
    a.startInfoPending = !!roleDef(a.roleId).flags.startInfo;
    this.dirty();
  }

  /** How many times this has come up in the run, from 0. */
  attempt(key: string): number {
    const n = this.attempts.get(key) ?? 0;
    this.attempts.set(key, n + 1);
    return n;
  }

  markChosen(key: string): boolean {
    if (this.chosenThisRun.has(key)) return false;
    this.chosenThisRun.add(key);
    return true;
  }

  /** A condition lasting until its source acts again ends if that source didn't act at its slot. */
  private endUnclaimed(def: RoleDef, actors: Instance[]) {
    const ended = this.world.conditions.filter((c) => {
      if (c.until !== 'source_acts_again' || c.source.kind !== 'ability') return false;
      const src = this.world.abilities[c.source.id];
      return src?.roleId === def.id && !actors.includes(src);
    });
    for (const c of ended) {
      this.removeCondition(c.id);
      this.log.push(`${this.reader.name(c.target)} is healthy: nothing took up that condition`);
    }
  }

  walk() {
    this.walking = true;
    const sheet = nightSheet(this.n);
    for (const a of this.reader.instances) roleDef(a.roleId).ability.nightStart?.(this.ctx(a));
    for (const def of sheet) {
      if (!def.ability.resolve) continue;
      const actors = this.actorsFor(def);
      for (const a of actors) {
        this.act(def, a);
        if (this.wakesAgain(a)) this.act(def, a, true);
      }
      this.endUnclaimed(def, actors);
    }
    for (const a of this.reader.instances) roleDef(a.roleId).ability.nightEnd?.(this.ctx(a));
    // Deaths after a role's slot: it acts once the order has finished.
    for (const def of sheet) {
      if (!def.flags.afterOrder) continue;
      for (const a of this.actorsFor(def)) {
        const pid = a.holder.kind === 'player' ? a.holder.id : null;
        if (!this.acted.has(`${pid}:${a.roleId}`) && !this.reader.isBelieved(a)) this.act(def, a);
      }
    }
  }

  transform() {
    const instances = this.reader.instances;
    const guaranteed = (player: PlayerId) =>
      instances.some((a) => roleDef(a.roleId).ability.guaranteesTruth?.(this.ctx(a), player));
    for (const row of this.results) {
      if (guaranteed(row.playerId)) continue;
      for (const a of instances) {
        const hook = roleDef(a.roleId).ability.transformInfo;
        if (!hook) continue;
        const draft: InfoDraft = {
          key: row.key,
          playerId: row.playerId,
          roleId: row.roleId,
          truth: row.truth,
          suggested: row.transformed ?? row.suggested,
        };
        const changed = hook(this.ctx(a), draft);
        if (changed) {
          row.transformed = changed;
          if (!row.overridden) row.final = changed;
        }
      }
    }
  }

  /** Suggestions from every ability, then the core's own Demon-count check. */
  checkGameEnd() {
    const r = this.reader;
    if (r.w.seats.length === 0) return;
    if (r.demons.length && !r.demons.some(r.isAlive)) this.suggestGameEnd('no_demon', 'good', 'No Demon is alive.');
    if (r.aliveResidents.length <= 2 && r.demons.some(r.isAlive)) {
      this.suggestGameEnd('two_left', 'evil', 'Only two players are alive.');
    }
    for (const a of r.instances) roleDef(a.roleId).ability.checkGameEnd?.(this.ctx(a));
  }

  private gameEndRows() {
    const changers = this.reader.instances.filter((a) => roleDef(a.roleId).ability.changesWinner);
    return [...this.gameEnd.values()]
      .filter((g) => !this.suppressed.has(g.key))
      .map((g) => {
        if (g.winner === null) return g;
        let winner: 'good' | 'evil' = g.winner;
        for (const a of changers) winner = roleDef(a.roleId).ability.changesWinner!(this.ctx(a), winner);
        return winner === g.winner ? g : { ...g, winner, reason: `${g.reason} The winner changes.` };
      });
  }

  finish(): Resolution {
    this.transform();
    this.checkGameEnd();
    return {
      actors: this.actors,
      results: this.results,
      decisions: [...this.decisions.values(), ...this.staleDecisions()],
      questions: this.questions,
      notices: this.notices,
      deaths: this.deaths,
      revived: this.revived,
      malfunctions: this.malfunctions,
      gameEnd: this.gameEndRows(),
      log: this.log,
      after: this.world,
    };
  }

  /** Writes a day run's findings back to the world. */
  commitDay() {
    this.checkGameEnd();
    const w = this.world;
    for (const m of this.malfunctions) w.events.push({ kind: 'malfunction', at: this.moment, ...m });
    for (const g of this.gameEndRows()) {
      if (!w.dismissedGameEnd.includes(g.key) && !w.gameEnd.some((x) => x.key === g.key)) w.gameEnd.push(g);
    }
    w.gameEnd = w.gameEnd.filter((g) => !this.suppressed.has(g.key));
  }
}
