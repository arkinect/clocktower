// Night resolution (section 5.10). resolveNight is a pure function of the game state: it clones the world,
// walks the night order and returns a Resolution (results, review items, the world after the night).
// Admin review choices are inputs (night.reviewChoices), so changing one simply re-runs resolution.
import {
  FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, ROLE_BY_ID, abilitiesOf, abilityKey, abilityTitle, hidesRole, jinxBetween, jinxLabel,
  type AbilitySource, type ActionChoice, type ActionSpec, type Alignment, type Cause, type Effect, type EffectExpiry, type EffectType, type GameState,
  type FollowUp, type NightSlot, type ReviewItem, type ReviewOption, type Resolution, type ResultRow, type ActorRow, type AbnormalEvent, type WorldState,
} from '@ct/shared';
import { activeImpairingEffects, computeImpairment, type Impairment } from './impairment';
import { subRng, type Rng } from './rng';
import {
  actingRoles, aliveIds, aliveNeighbours, alignmentOf, canAct, clearStartInfo, findPlayer, flag, getPlayer, hasAbility, isAlive,
  isDemon, nameOf, playersWithAbility, roleIdOf, roleName, seatedIds, startInfoPending, typeOf,
} from './world';
import { BEHAVIOURS, godfatherTriggered } from './roles';
import { becomeDemon, scarletWomanAgain } from './demon';
import { revivePlayer } from './lifecycle';
import { enabledRoles } from './setup';
export { becomeDemon, demonInfoLines } from './demon';

export function nightOrder(night: number) {
  return night === 0 ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
}

export interface Actor {
  pid: string;
  roleId: string;
  choice: ActionChoice | null;
  slot: string;
  /** Where the ability comes from (the first source, when several give the same role): decides the title shown. */
  source: AbilitySource;
  /** The first night the ability works. Later than tonight only for start information given the night it's gained. */
  fromNight: number;
  /** False when the player only believes they have it (a believed role, or an ability eaten from an evil executee). */
  real: boolean;
}

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
  /** Questions asked tonight (askFollowUp), answered or not. */
  readonly followUps: FollowUp[] = [];
  readonly notices: { playerId: string; title: string; lines: string[] }[] = [];
  readonly impairAtDeath: Record<string, Impairment> = {};
  /** Cause of each death tonight (Grandmother link needs demon_attack). */
  readonly deathCause: Record<string, string> = {};
  /** Players revived or given a new role tonight: they act again from the next night. */
  readonly noActTonight = new Set<string>();
  private goonTriggered = new Set<string>();
  private currentActorRow: ActorRow | null = null;
  private currentActor: Actor | null = null;
  private killSeq = 0;

  constructor(readonly state: GameState, readonly now: number) {
    this.w = structuredClone({
      players: state.players, assignments: state.assignments, flags: state.flags,
      effects: state.effects, roleState: state.roleState, setup: state.setup,
    });
    this.n = state.night!.number;
  }

  get night() { return this.state.night!; }
  get enabledRoleIds(): string[] { return enabledRoles(this.state); }

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

  // ---- follow-up questions --------------------------------------------------------------------
  /**
   * Ask a player a question during review (the Ravenkeeper's choice after dying, for example). Returns the answer
   * once the player or the Storyteller has given one, else null. Publishing waits for every question unless forced,
   * the night timer is extended when questions first appear, and "Accept all defaults" never answers one. With
   * `asksOther` the answer isn't the actor's own input (the Al-Hadikhia's chosen players), so the actor row keeps theirs.
   */
  askFollowUp(q: { key: string; playerId: string; roleId: string; spec: ActionSpec; asksOther?: true }): ActionChoice | null {
    // A question asked by a hidden eaten ability is shown to the player only as the Cannibal's (one eaten ability per
    // player): its key and spec. The question's roleId, seen only by the Storyteller, stays the eaten role.
    const actor = this.currentActor;
    if (actor && actor.pid === q.playerId && hidesRole(actor)) {
      q = { ...q, key: `cannibal:${q.playerId}`, spec: { ...q.spec, roleId: 'cannibal', title: abilityTitle(actor) } };
    }
    const a = this.night.followUpAnswers[q.key];
    this.followUps.push({ key: q.key, playerId: q.playerId, roleId: q.roleId, spec: { ...q.spec, key: q.key }, answered: !!a });
    if (a && this.currentActorRow && !q.asksOther) this.currentActorRow.input = describeChoice(this.w, a.choice);
    return a?.choice ?? null;
  }

  // ---- results --------------------------------------------------------------------------------
  /** Record a private result. When the actor is impaired, `falseLines` is what is suggested. */
  result(actor: Actor, title: string, trueLines: string[], falseLines: string[] | null, alternatives: string[][] = []) {
    // The title is what the player's message is called ("Cannibal" for a hidden eaten ability); the row itself is
    // the Storyteller's and keeps the real role.
    title = abilityTitle(actor, title);
    const imp = this.impForActor(actor);
    const suggested = imp.impaired && falseLines ? falseLines : trueLines;
    const roleId = actor.roleId;
    const key = `${actor.pid}:${roleId}`;
    const override = this.night.overrides[key];
    this.results.push({
      key, playerId: actor.pid, roleId, title, trueLines, suggestedLines: suggested,
      finalLines: override ?? suggested, impaired: imp.impaired, causes: imp.causes, overridden: !!override,
      alternatives,
    });
  }

  /** Whether a start-information role (RoleData.startInfo) gives its information tonight: night 0, or just gained. */
  startInfoDue(actor: Actor): boolean {
    return this.n === 0 || startInfoPending(this.w, actor.pid).includes(actor.roleId);
  }

  impForActor(actor: Actor): Impairment {
    if (BEHAVIOURS[actor.roleId]?.wakesOnNightDeath && this.impairAtDeath[actor.pid]) return this.impairAtDeath[actor.pid];
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

  /** Shared revive (Professor, Shabaloth, Al-Hadikhia). */
  revive(pid: string, reason: string): boolean {
    if (!revivePlayer(this.w, pid)) return false;
    this.revived.push(pid);
    this.noActTonight.add(pid);
    this.outcome(`${this.name(pid)} is alive again (${reason})`);
    const back = scarletWomanAgain(this.w, this.now, (id, title, lines) => this.notice(id, title, lines));
    if (back) {
      this.noActTonight.add(back);
      this.outcome(`${jinxLabel(jinxBetween('scarlet_woman', 'al_hadikhia')!)}: ${this.name(back)} is the Scarlet Woman again`);
    }
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
      becomeDemon(this.w, sw, demonId, this.now, (pid, title, lines) => this.notice(pid, title, lines));
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
      if (!slot.roleId || !BEHAVIOURS[slot.roleId]?.resolve) continue;
      const actors = this.actorsFor(slot.id, slot.roleId);
      for (const actor of actors) this.act(slot, actor);
      if (slot.roleId === 'pukka') this.endUnclaimedPukkaPoison(actors);
    }
    // Deaths after a role's slot (the Moonchild's target, a Grandmother's link): it acts once the order has finished.
    for (const slot of order) {
      if (!slot.roleId || !BEHAVIOURS[slot.roleId]?.alsoAfterOrder) continue;
      for (const actor of this.actorsFor(slot.id, slot.roleId)) {
        if (actor.real && !this.actors.some((r) => r.playerId === actor.pid && r.roleId === actor.roleId)) this.act(slot, actor);
      }
    }
    const after = this.w;
    return {
      computedAt: this.now,
      actors: this.actors, results: this.results, reviewItems: this.items, log: this.log,
      deaths: this.deaths, revived: this.revived, abnormal: this.abnormal, followUps: this.followUps,
      notices: this.notices, after,
    };
  }

  /**
   * A Pukka's poison lasts until the player who caused it acts again. If they didn't act at the Pukka's slot tonight
   * (dead, or a Scarlet Woman has taken over), the poison ends here and the target doesn't die.
   */
  private endUnclaimedPukkaPoison(actors: Actor[]) {
    const ended = this.w.effects.filter((e) => e.cause === 'pukka' && !actors.some((a) => a.pid === e.sourcePlayerId));
    if (!ended.length) return;
    this.w.effects = this.w.effects.filter((e) => !ended.includes(e));
    for (const e of ended) this.log.push(`${this.name(e.targetPlayerId)} is healthy: no Pukka took up the poison`);
  }

  private act(slot: NightSlot, actor: Actor) {
    const b = BEHAVIOURS[actor.roleId];
    const row: ActorRow = {
      slot: slot.label, playerId: actor.pid, roleId: actor.roleId, input: describeChoice(this.w, actor.choice),
      impaired: false, causes: [], outcome: '',
    };
    this.actors.push(row);
    this.currentActorRow = row;
    this.currentActor = actor;
    this.goonCheck(actor);
    const imp2 = this.impForActor(actor);
    row.impaired = imp2.impaired;
    row.causes = imp2.causes;
    if (imp2.impaired && !(actor.choice?.decline) && !b.wakesOnNightDeath) this.abnormalIfExternal(actor.pid, `${roleName(actor.roleId)} ability impaired`);
    b.resolve!(this, actor);
    // A start-information role has now given its information (true or false): it isn't pending any more.
    if (ROLE_BY_ID[actor.roleId]?.startInfo) clearStartInfo(this.w, actor.pid, actor.roleId);
    this.currentActorRow = null;
    this.currentActor = null;
  }

  actorsFor(slotId: string, roleId: string): Actor[] {
    const b = BEHAVIOURS[roleId];
    const out: Actor[] = [];
    for (const pid of seatedIds(this.w)) {
      // Start information comes the night the ability is gained (startInfoPending), even before the ability works: a
      // Philosopher's choice, a Damsel given a new role tonight. Any other ability only once it works.
      const pending = startInfoPending(this.w, pid).includes(roleId);
      const ability = abilitiesOf(this.w, pid, pending ? Infinity : this.n).find((x) => x.roleId === roleId);
      if (!ability) continue;
      const ctx = { w: this.w, pid, night: this.n, state: this.state };
      if (b.wakesOnNightDeath) {
        // Dead now, so not skipped for being revived or given this role earlier tonight, if they then died.
        if (!this.deaths.includes(pid) || isAlive(this.w, pid)) continue;
      } else {
        if (this.noActTonight.has(pid) && !pending) continue;
        if (!canAct(this.w, pid) && !b.actsWhileDead && !b.wakesDead?.(ctx)) continue;
      }
      if (b.wakes && !b.wakes(ctx)) continue;
      // Nothing is submitted for these: the Ravenkeeper's choice comes later, as a follow-up question (askFollowUp).
      const sub = b.wakesOnNightDeath ? undefined : this.night.submissions[pid];
      out.push({
        pid, roleId, slot: slotId, choice: sub?.actions[abilityKey(ability)] ?? null, source: ability.source, fromNight: ability.fromNight,
        real: ability.real,
      });
    }
    return out;
  }
}

export function describeChoice(w: WorldState, c: ActionChoice | null): string {
  if (!c) return '(no input)';
  if (c.decline) return 'declined / no one';
  return c.values.map((v) => (findPlayer(w, v) ? nameOf(w, v) : roleName(v))).join(', ');
}

export function resolveNight(state: GameState, now: number): Resolution {
  return new NightRun(state, now).run();
}
