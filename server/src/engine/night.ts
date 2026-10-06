// Night resolution (section 5.10). resolveNight is a pure function of the game state: it clones the world,
// walks the night order and returns a Resolution (results, review items, the world after the night).
// Admin review choices are inputs (night.reviewChoices), so changing one simply re-runs resolution.
import {
  FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, ROLE_BY_ID,
  type ActionChoice, type Alignment, type Cause, type Effect, type EffectExpiry, type EffectType, type GameState,
  type ReviewItem, type ReviewOption, type Resolution, type ResultRow, type ActorRow, type AbnormalEvent, type WorldState,
} from '@ct/shared';
import { activeImpairingEffects, computeImpairment, type Impairment } from './impairment';
import { subRng, type Rng } from './rng';
import {
  actingRoles, aliveIds, aliveNeighbours, alignmentOf, canAct, findPlayer, flag, getPlayer, hasAbility, isAlive,
  isDemon, nameOf, playersWithAbility, roleIdOf, roleName, seatedIds, typeOf,
} from './world';
import { BEHAVIOURS, godfatherTriggered } from './roles';
import { becomeDemon } from './demon';
import { revivePlayer } from './lifecycle';
export { becomeDemon, demonInfoLines } from './demon';

export function nightOrder(night: number) {
  return night === 0 ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
}

export interface Actor { pid: string; roleId: string; choice: ActionChoice | null; slot: string }

export interface KillOptions { skipMayor?: boolean; noScarlet?: boolean }
export type KillCause = 'demon_attack' | 'assassin' | 'ability_kill' | 'self_gamble' | 'grandchild_link';

export class NightRun {
  readonly w: WorldState;
  readonly n: number;
  readonly items: ReviewItem[] = [];
  readonly results: ResultRow[] = [];
  readonly actors: ActorRow[] = [];
  readonly log: string[] = [];
  readonly deaths: string[] = [];
  readonly revived: string[] = [];
  readonly abnormal: AbnormalEvent[] = [];
  readonly awaitingRavenkeeper: string[] = [];
  readonly notices: { playerId: string; title: string; lines: string[] }[] = [];
  readonly impairAtDeath: Record<string, Impairment> = {};
  /** Cause of each death tonight (Grandmother link needs demon_attack). */
  readonly deathCause: Record<string, string> = {};
  /** Players revived or given a new role tonight: they act again from the next night. */
  readonly noActTonight = new Set<string>();
  private goonTriggered = new Set<string>();
  private currentActorRow: ActorRow | null = null;
  private killSeq = 0;

  constructor(readonly state: GameState) {
    this.w = structuredClone({
      players: state.players, assignments: state.assignments, flags: state.flags,
      effects: state.effects, roleState: state.roleState, setup: state.setup,
    });
    this.n = state.night!.number;
  }

  get night() { return this.state.night!; }
  get enabledRoleIds(): string[] { return Object.keys(this.state.enabledRoles).filter((r) => this.state.enabledRoles[r]); }

  rng(key: string): Rng { return subRng(this.night.seed, key); }

  imp(pid: string): Impairment { return computeImpairment(this.w, this.n)[pid] ?? { impaired: false, causes: [] }; }
  sober(pid: string): boolean { return !this.imp(pid).impaired; }

  name(pid: string | null | undefined) { return nameOf(this.w, pid); }

  // ---- review items --------------------------------------------------------------------------
  review(key: string, kind: string, title: string, description: string, options: ReviewOption[], def: string): string {
    const chosenRaw = this.night.reviewChoices[key];
    const valid = options.some((o) => o.id === chosenRaw);
    const item: ReviewItem = { key, kind, title, description, options, default: def, chosen: valid ? chosenRaw : null };
    const existing = this.items.findIndex((i) => i.key === key);
    if (existing >= 0) this.items[existing] = item; else this.items.push(item);
    return valid ? chosenRaw : def;
  }

  // ---- effects --------------------------------------------------------------------------------
  addEffect(type: EffectType, cause: Cause, source: string | null, target: string, expiry: EffectExpiry): Effect {
    const e: Effect = { id: `e${this.n}-${this.w.effects.length}-${source ?? 'x'}-${target}`, type, cause, sourcePlayerId: source, targetPlayerId: target, startNight: this.n, expiry };
    this.w.effects.push(e);
    return e;
  }

  setFlag(pid: string, key: string, value = true) {
    (this.w.flags[pid] ??= {})[key] = value;
  }

  setRs(pid: string, key: string, value: unknown) {
    (this.w.roleState[pid] ??= {})[key] = value;
  }

  addAbnormal(pid: string, cause: string, detail: string) {
    this.abnormal.push({ playerId: pid, cause, detail });
  }

  /** Impairment caused by another character (not the player's own ability, own character, or a Storyteller edit). */
  externalImpairment(pid: string): string[] {
    return activeImpairingEffects(this.w, this.n)
      .filter((e) => e.targetPlayerId === pid && e.sourcePlayerId !== pid && e.cause !== 'admin')
      .map((e) => `${e.type}:${e.cause}`);
  }

  /** Mathematician: log an abnormal event only when another character caused the impairment. */
  abnormalIfExternal(pid: string, detail: string) {
    const ext = this.externalImpairment(pid);
    if (ext.length) this.addAbnormal(pid, ext.join(','), detail);
  }

  outcome(text: string) {
    if (this.currentActorRow) this.currentActorRow.outcome = this.currentActorRow.outcome ? `${this.currentActorRow.outcome}; ${text}` : text;
    this.log.push(text);
  }

  notice(pid: string, title: string, lines: string[]) {
    this.notices.push({ playerId: pid, title, lines });
  }

  // ---- results --------------------------------------------------------------------------------
  /** Record a private result. When the actor is impaired, `falseLines` is what is suggested. */
  result(actor: Actor, title: string, trueLines: string[], falseLines: string[] | null, alternatives: string[][] = []) {
    const imp = this.impForActor(actor);
    const suggested = imp.impaired && falseLines ? falseLines : trueLines;
    const key = `${actor.pid}:${actor.roleId}`;
    const override = this.night.overrides[key];
    this.results.push({
      key, playerId: actor.pid, roleId: actor.roleId, title, trueLines, suggestedLines: suggested,
      finalLines: override ?? suggested, impaired: imp.impaired, causes: imp.causes, overridden: !!override,
      alternatives,
    });
  }

  impForActor(actor: Actor): Impairment {
    if (actor.slot === 'ravenkeeper' && this.impairAtDeath[actor.pid]) return this.impairAtDeath[actor.pid];
    return this.imp(actor.pid);
  }

  // ---- registration (section 5.8) ------------------------------------------------------------
  private isRegistrationSource(subject: string): boolean {
    return hasAbility(this.w, subject, 'recluse', this.n) && this.sober(subject);
  }

  /** Returns 'truthful' | 'minion' | 'demon' for how `subject` registers to this asker. */
  private recluseRegistration(askerKey: string, subject: string): 'truthful' | 'minion' | 'demon' {
    if (!this.isRegistrationSource(subject)) return 'truthful';
    const chosen = this.review(
      `reg:${askerKey}:${subject}`, 'registration',
      `How does ${this.name(subject)} (Recluse) register?`,
      `Asked by ${askerKey.split(':')[0].replace('_', ' ')} (${this.name(askerKey.split(':')[1])}). Applies to this query only.`,
      [
        { id: 'truthful', label: 'Truthfully (good Outsider)' },
        { id: 'minion', label: 'As an evil Minion' },
        { id: 'demon', label: 'As an evil Demon' },
      ],
      'truthful',
    ) as 'truthful' | 'minion' | 'demon';
    if (chosen !== 'truthful') this.addAbnormal(subject, 'recluse', `registered as ${chosen} to ${askerKey}`);
    return chosen;
  }

  regAlignment(askerKey: string, subject: string): Alignment {
    const r = this.recluseRegistration(askerKey, subject);
    return r === 'truthful' ? alignmentOf(this.w, subject) : 'evil';
  }

  regIsDemon(askerKey: string, subject: string): boolean {
    const r = this.recluseRegistration(askerKey, subject);
    return r === 'truthful' ? isDemon(this.w, subject) : r === 'demon';
  }

  regIsMinion(askerKey: string, subject: string): boolean {
    const r = this.recluseRegistration(askerKey, subject);
    return r === 'truthful' ? typeOf(this.w, subject) === 'minion' && !isDemon(this.w, subject) : r === 'minion';
  }

  regRole(askerKey: string, subject: string): string {
    const truth = roleIdOf(this.w, subject) ?? 'unknown';
    if (!this.isRegistrationSource(subject)) return truth;
    const evilRoles = this.enabledRoleIds.filter((r) => ROLE_BY_ID[r].type === 'minion' || ROLE_BY_ID[r].type === 'demon');
    const chosen = this.review(
      `reg:${askerKey}:${subject}:role`, 'registration',
      `Which character does ${this.name(subject)} (Recluse) register as?`,
      `Asked by ${askerKey.split(':')[0].replace('_', ' ')} (${this.name(askerKey.split(':')[1])}).`,
      [{ id: 'truthful', label: 'Truthfully (Recluse)' }, ...evilRoles.map((r) => ({ id: `role:${r}`, label: ROLE_BY_ID[r].name }))],
      'truthful',
    );
    if (chosen === 'truthful') return truth;
    this.addAbnormal(subject, 'recluse', `registered as ${chosen} to ${askerKey}`);
    return chosen.slice(5);
  }

  // ---- kill pipeline (section 5.9) -----------------------------------------------------------
  attemptKill(target: string, cause: KillCause, attacker: string | null, opts: KillOptions = {}): boolean {
    const tname = this.name(target);
    const p = findPlayer(this.w, target);
    if (!p || !p.alive) {
      this.outcome(`${tname} is already dead`);
      return false;
    }
    if (cause !== 'assassin') {
      if (hasAbility(this.w, target, 'sailor', this.n)) {
        if (this.sober(target)) { this.outcome(`${tname} survives: Sailor can't die`); return false; }
        this.abnormalIfExternal(target, 'Sailor protection failed');
      }
      const prot = this.w.effects.find((e) => e.type === 'protected' && e.targetPlayerId === target);
      if (prot) { this.outcome(`${tname} survives: protected by the Innkeeper`); return false; }
      for (const tl of playersWithAbility(this.w, 'tea_lady', this.n)) {
        if (!isAlive(this.w, tl)) continue;
        const nb = aliveNeighbours(this.w, tl);
        if (!nb.includes(target) || nb.length < 2) continue;
        const bothGood = nb.every((x) => this.regAlignment(`tea_lady:${tl}`, x) === 'good');
        if (!bothGood) continue;
        if (this.sober(tl)) { this.outcome(`${tname} survives: neighbour of the Tea Lady (${this.name(tl)})`); return false; }
        this.abnormalIfExternal(tl, 'Tea Lady protection failed');
      }
      if (hasAbility(this.w, target, 'fool', this.n) && !flag(this.w, target, 'fool_used')) {
        if (this.sober(target)) {
          this.setFlag(target, 'fool_used');
          this.outcome(`${tname} survives: Fool's first death (Fool now used)`);
          return false;
        }
        this.abnormalIfExternal(target, 'Fool protection failed');
      }
    }
    const byOther = attacker !== null && attacker !== target;
    if (!opts.skipMayor && byOther && hasAbility(this.w, target, 'mayor', this.n)) {
      if (this.sober(target)) {
        const seq = this.killSeq++;
        const rng = this.rng(`mayor:${seq}:${target}`);
        const heads = rng.coin();
        const pool = aliveIds(this.w).filter((x) => x !== target && x !== attacker);
        const redirect = !heads && pool.length > 0 ? rng.pick(pool) : null;
        const def = redirect ? `redirect:${redirect}` : 'die';
        const chosen = this.review(
          `mayor:${seq}:${target}`, 'mayor', `Mayor ${tname} is attacked`,
          `Coin: ${heads ? 'heads, the Mayor dies' : `tails, redirect to ${this.name(redirect)}`}. Redirects still go through protections.`,
          [
            { id: 'die', label: `${tname} (Mayor) dies` },
            { id: 'none', label: 'Nobody dies' },
            ...aliveIds(this.w).filter((x) => x !== target).map((x) => ({ id: `redirect:${x}`, label: `Attack ${this.name(x)} instead` })),
          ],
          def,
        );
        if (chosen === 'none') { this.outcome(`Mayor ${tname} attacked: nobody dies (Admin choice)`); return false; }
        if (chosen.startsWith('redirect:')) {
          const other = chosen.slice(9);
          this.outcome(`Mayor ${tname} attacked: death redirected to ${this.name(other)}`);
          this.attemptKill(other, cause, attacker, { ...opts, skipMayor: true });
          return false;
        }
      } else {
        this.abnormalIfExternal(target, 'Mayor bounce failed');
      }
    }
    this.kill(target, cause, opts);
    return true;
  }

  /** Unconditional death plus triggers. */
  kill(target: string, cause: string, opts: KillOptions = {}) {
    const p = getPlayer(this.w, target);
    const aliveBefore = aliveIds(this.w).length;
    this.impairAtDeath[target] = this.imp(target);
    p.alive = false;
    p.deadAt = { phase: 'night', number: this.n };
    p.deathCause = cause;
    this.deathCause[target] = cause;
    this.deaths.push(target);
    this.outcome(`${this.name(target)} dies (${cause.replace('_', ' ')})`);
    if (hasAbility(this.w, target, 'moonchild', this.n)) this.setRs(target, 'soberAtDeath', this.impairAtDeath[target].impaired === false);
    if (isDemon(this.w, target) && !opts.noScarlet) this.scarletCheck(target, aliveBefore);
  }

  /** Shared revive (Professor, Shabaloth). */
  revive(pid: string, reason: string): boolean {
    if (!revivePlayer(this.w, pid)) return false;
    this.revived.push(pid);
    this.noActTonight.add(pid);
    this.outcome(`${this.name(pid)} is alive again (${reason})`);
    return true;
  }

  scarletCheck(demonId: string, aliveBefore: number) {
    if (aliveBefore < 5) return;
    for (const sw of playersWithAbility(this.w, 'scarlet_woman', this.n)) {
      if (!isAlive(this.w, sw) || !this.sober(sw) || sw === demonId) continue;
      const chosen = this.review(
        `scarlet:${demonId}`, 'scarlet_woman', `Scarlet Woman ${this.name(sw)} becomes the Demon?`,
        `${this.name(demonId)} (the Demon) died with ${aliveBefore} players alive.`,
        [{ id: 'yes', label: 'Yes, she becomes the Demon' }, { id: 'no', label: 'No' }], 'yes',
      );
      if (chosen !== 'yes') return;
      becomeDemon(this.w, sw, demonId, (pid, title, lines) => this.notice(pid, title, lines));
      this.outcome(`${this.name(sw)} (Scarlet Woman) becomes the Demon`);
      return;
    }
  }

  // ---- goon check ----------------------------------------------------------------------------
  goonCheck(actor: Actor) {
    if (!actor.choice || actor.choice.decline) return;
    const chosen = actor.choice.values.filter((v) => findPlayer(this.w, v));
    for (const goon of chosen) {
      if (goon === actor.pid || roleIdOf(this.w, goon) !== 'goon' || this.goonTriggered.has(goon)) continue;
      this.goonTriggered.add(goon);
      if (!this.sober(goon)) {
        this.abnormalIfExternal(goon, 'Goon had no effect');
        this.outcome(`${this.name(actor.pid)} chose the Goon (${this.name(goon)}), but the Goon is impaired`);
        continue;
      }
      this.addEffect('drunk', 'goon', goon, actor.pid, 'until_dusk');
      this.w.assignments[goon].alignment = alignmentOf(this.w, actor.pid);
      this.outcome(`${this.name(actor.pid)} chose the Goon first: drunk until dusk, Goon becomes ${alignmentOf(this.w, actor.pid)}`);
    }
  }

  // ---- walk ----------------------------------------------------------------------------------
  run(): Resolution {
    const order = nightOrder(this.n);
    // Godfather trigger (design.md section 14.6): a review item the Admin can flip; also settable while collecting.
    if (this.n >= 1 && seatedIds(this.w).some((id) => actingRoles(this.w, id, this.n).includes('godfather') && canAct(this.w, id))) {
      const derived = godfatherTriggered({ ...this.state, night: { ...this.night, reviewChoices: {} } }, this.n);
      this.review('godfather_trigger', 'godfather_trigger', 'Godfather may kill tonight?',
        derived ? 'An Outsider died during the day.' : 'No Outsider died during the day.',
        [{ id: 'yes', label: 'Yes, the Godfather kills' }, { id: 'no', label: 'No' }], derived ? 'yes' : 'no');
    }
    for (const slot of order) {
      if (!slot.roleId) continue;
      const b = BEHAVIOURS[slot.roleId];
      if (!b?.resolve) continue;
      for (const actor of this.actorsFor(slot.id, slot.roleId)) {
        const row: ActorRow = {
          slot: slot.label, playerId: actor.pid, roleId: actor.roleId, input: describeChoice(this.w, actor.choice),
          impaired: false, causes: [], outcome: '',
        };
        this.actors.push(row);
        this.currentActorRow = row;
        this.goonCheck(actor);
        const imp2 = this.impForActor(actor);
        row.impaired = imp2.impaired;
        row.causes = imp2.causes;
        if (imp2.impaired && !(actor.choice?.decline) && actor.slot !== 'ravenkeeper') this.abnormalIfExternal(actor.pid, `${roleName(actor.roleId)} ability impaired`);
        b.resolve(this, actor);
        this.currentActorRow = null;
      }
    }
    const after = this.w;
    return {
      computedAt: Date.now(),
      actors: this.actors, results: this.results, reviewItems: this.items, log: this.log,
      deaths: this.deaths, revived: this.revived, abnormal: this.abnormal, awaitingRavenkeeper: this.awaitingRavenkeeper,
      notices: this.notices, after,
    };
  }

  actorsFor(slotId: string, roleId: string): Actor[] {
    const b = BEHAVIOURS[roleId];
    const out: Actor[] = [];
    for (const pid of seatedIds(this.w)) {
      if (!actingRoles(this.w, pid, this.n).includes(roleId)) continue;
      if (this.noActTonight.has(pid) && !(roleId === 'grandmother' && this.w.roleState[pid]?.grandmotherInfoPending)) continue;
      if (slotId === 'ravenkeeper') {
        if (!this.deaths.includes(pid)) continue;
      } else if (!canAct(this.w, pid) && !b.actsWhileDead) continue;
      if (b.wakes && !b.wakes({ w: this.w, pid, night: this.n, state: this.state })) continue;
      const sub = slotId === 'ravenkeeper' ? this.night.ravenSubmissions[pid] : this.night.submissions[pid];
      out.push({ pid, roleId, slot: slotId, choice: sub?.actions[roleId] ?? null });
    }
    return out;
  }
}

export function describeChoice(w: WorldState, c: ActionChoice | null): string {
  if (!c) return '(no input)';
  if (c.decline) return 'declined / no one';
  return c.values.map((v) => (findPlayer(w, v) ? nameOf(w, v) : roleName(v))).join(', ');
}

export function resolveNight(state: GameState): Resolution {
  return new NightRun(state).run();
}
