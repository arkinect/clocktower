// Plays one random game on both engines, comparing them after every night and day.
// Coin flips are pinned: every decision is made explicitly and mapped to both engines.
import {
  actionSpecs as oldSpecs,
  applyIntent,
  computeImpairment as oldImpairment,
  createGame as oldCreate,
  joinPlayer,
  resolveNight as oldResolve,
  type OldChoice,
  type OldFollowUp,
  type OldIntent,
  type OldReviewItem,
  type OldState,
} from '@old/engine';
import { type ActionSpec, type Choice, type Command, type PlayerId, type RoleId } from '@ct/protocol';
import {
  actionSpecs,
  computeImpairment,
  createGame,
  defaultScript,
  dispatch,
  findRole,
  resolveNight,
  type GameStateT,
} from '../../src';
import type { ReviewItem } from '@ct/protocol';
import { phaseMoment } from '../../src/model/state';
import { makeRng, type Rng } from '../../src/util/rng';

const ST = 'st' as PlayerId;
const CHART: [number, number, number][] = [
  [3, 0, 1],
  [3, 1, 1],
  [5, 0, 1],
  [5, 1, 1],
  [5, 2, 1],
  [7, 0, 2],
  [7, 1, 2],
  [7, 2, 2],
];

export interface Difference {
  seed: number;
  at: string;
  what: string;
  old: unknown;
  next: unknown;
}


export class Pair {
  rng: Rng;
  now = 1000;
  old: OldState;
  next: GameStateT;
  adminOld = '';
  /** New ids by old id, and back. */
  toNew = new Map<string, string>();
  toOld = new Map<string, string>();
  ids: PlayerId[] = [];
  diffs: Difference[] = [];
  checks = 0;
  trace = false;
  nights = 0;
  decided = 0;
  answered = 0;
  deaths = 0;
  lines = 0;

  constructor(readonly seed: number) {
    this.rng = makeRng(seed);
    this.old = oldCreate('P', 0);
    this.next = createGame('P', 0);
  }

  o(intent: OldIntent, actor = this.adminOld) {
    this.now += 1;
    const r = applyIntent(this.old, actor, intent, { now: this.now, seed: this.seed + this.now });
    if (!r.ok) throw new Error(`old ${intent.type}: ${r.error}`);
    this.old = r.state;
  }

  /** Runs an intent the old engine may refuse. */
  tryOld(intent: OldIntent): boolean {
    this.now += 1;
    const r = applyIntent(this.old, this.adminOld, intent, { now: this.now, seed: this.seed + this.now });
    if (r.ok) this.old = r.state;
    return r.ok;
  }

  c(command: Command, actor: PlayerId | null = ST) {
    this.now += 1;
    const r = dispatch(this.next, actor, command, { now: this.now, seed: this.seed + this.now });
    if (!r.ok) throw new Error(`new ${command.type}: ${r.error}`);
    this.next = r.state;
    return r.data;
  }

  tryNew(command: Command): boolean {
    this.now += 1;
    const r = dispatch(this.next, ST, command, { now: this.now, seed: this.seed + this.now });
    if (r.ok) this.next = r.state;
    return r.ok;
  }

  /** The old app's bug, fixed by ruling (docs/rulings.md): a game that reaches it stops being comparable. */
  get rulingApplies() {
    return Object.values(this.next.players).some((p) =>
      p.history.some((h) => h.kind === 'character' && h.from === 'scarlet_woman' && h.to === 'vigormortis'),
    );
  }

  diff(at: string, what: string, old: unknown, next: unknown) {
    this.checks += 1;
    if (this.rulingApplies) return;
    if (JSON.stringify(old) !== JSON.stringify(next)) this.diffs.push({ seed: this.seed, at, what, old, next });
  }

  // ---- setup ----
  cast(): string[] {
    const rng = this.rng;
    const n = rng.int(8) + 5;
    const [t, o, m] = CHART[n - 5] as [number, number, number];
    const demons = 1;
    const by = (type: string) => defaultScript().filter((r) => findRole(r)?.type === type) as string[];
    const take = (list: string[], k: number) => {
      const out: string[] = [];
      const pool = [...list];
      for (let i = 0; i < k && pool.length; i++) out.push(pool.splice(rng.int(pool.length), 1)[0] as string);
      return out;
    };
    const roles = [
      ...take(by('townsfolk'), t),
      ...take(by('outsider'), o),
      ...take(by('minion'), m),
      ...take(by('demon'), demons),
    ];
    while (roles.length < n)
      roles.push(
        take(
          by('townsfolk').filter((r) => !roles.includes(r)),
          1,
        )[0] as string,
      );
    for (let i = roles.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [roles[i], roles[j]] = [roles[j] as string, roles[i] as string];
    }
    return roles;
  }

  setup(roles: string[]) {
    const a = joinPlayer(this.old, { name: 'Admin', rolePreference: 'none', wantsAdmin: true }, 'a', 0);
    if (!a.ok) throw new Error(a.error);
    this.old = a.state;
    this.adminOld = a.player.id;
    this.c({ type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true }, null);
    roles.forEach((_, i) => {
      const name = `P${i}`;
      const j = joinPlayer(this.old, { name, rolePreference: 'none', wantsAdmin: false }, `t${i}`, i + 1);
      if (!j.ok) throw new Error(j.error);
      this.old = j.state;
      const id = `p${i}` as PlayerId;
      this.c({ type: 'join', id, name, rolePreference: 'none', wantsStoryteller: false }, null);
      this.toNew.set(j.player.id, id);
      this.toOld.set(id, j.player.id);
      this.ids.push(id);
    });
    this.o({ type: 'go_setup' });
    this.c({ type: 'open_setup' });
    this.o({ type: 'set_seating', order: this.ids.map((id) => this.oldId(id)) });
    this.c({ type: 'set_seating', order: this.ids });
    roles.forEach((r, i) => {
      const id = this.ids[i] as PlayerId;
      this.o({ type: 'assign_role', playerId: this.oldId(id), roleId: r });
      this.c({ type: 'assign_character', playerId: id, roleId: r as RoleId });
    });
    const script = defaultScript() as string[];
    const spareOf = (ok: (r: string) => boolean) => this.rng.pick(script.filter((r) => ok(r) && !roles.includes(r)));
    const told: string[] = [];
    roles.forEach((r, i) => {
      const id = this.ids[i] as PlayerId;
      if (r === 'drunk' || r === 'marionette') {
        const b = spareOf((x) => findRole(x)?.type === 'townsfolk' && !told.includes(x));
        told.push(b);
        this.o({ type: 'set_believed_role', playerId: this.oldId(id), roleId: b });
        this.c({ type: 'set_believed', playerId: id, roleId: b as RoleId });
      }
    });
    const ability = (role: string) => Object.values(this.next.abilities).find((a) => a.roleId === role)?.id;
    if (roles.includes('fortune_teller')) {
      const good = this.ids.filter((id) => this.next.players[id]?.alignment === 'good');
      const h = this.rng.pick(good);
      this.o({ type: 'set_red_herring', playerId: this.oldId(h) });
      this.c({ type: 'set_setup_field', abilityId: ability('fortune_teller') as never, field: 'herring', value: h });
    }
    if (roles.includes('mezepheles')) {
      this.o({ type: 'set_mezepheles_word', word: 'apple' });
      this.c({ type: 'set_setup_field', abilityId: ability('mezepheles') as never, field: 'word', value: 'apple' });
    }
    if (roles.includes('lil_monsta')) {
      const m = spareOf((x) => findRole(x)?.type === 'minion');
      this.o({ type: 'set_lil_monsta_minion', roleId: m });
      this.c({ type: 'set_setup_field', abilityId: ability('lil_monsta') as never, field: 'minion', value: m });
    }
    if (roles.includes('godfather')) {
      this.o({ type: 'set_godfather_outsiders', value: 1 });
      this.c({ type: 'set_setup_field', abilityId: ability('godfather') as never, field: 'outsiders', value: '+1' });
    }
    this.o({ type: 'begin_night0', force: true });
    this.c({ type: 'begin_first_night', force: true });
    this.o({ type: 'start_collecting' });
    this.c({ type: 'open_collecting' });
  }

  oldId(id: string): string {
    return this.toOld.get(id) ?? id;
  }

  newId(id: string): string {
    return this.toNew.get(id) ?? id;
  }

  // ---- night ----
  /** The options of a new spec, as old values too, once checked against the old spec. */
  submit(at: string) {
    for (const id of this.ids) {
      const specs = actionSpecs(this.next, id);
      const olds = oldSpecs(this.old, this.oldId(id));
      this.diff(
        at,
        `pickers:${id}`,
        olds.map((s) => s.roleId),
        specs.map((s) => s.roleId),
      );
      const actionsNew: Record<string, Choice> = {};
      const actionsOld: Record<string, OldChoice> = {};
      specs.forEach((spec, i) => {
        const old = olds.find((x) => x.roleId === spec.roleId) ?? olds[i];
        if (!old) return;
        this.diff(
          at,
          `options:${id}:${spec.roleId}`,
          this.mapFields(old),
          spec.fields.map((f) => [...f.options].sort()),
        );
        const choice = this.choose(spec);
        actionsNew[spec.key] = choice;
        actionsOld[old.key] = this.oldChoice(choice);
      });
      if (specs.length) {
        this.c({ type: 'submit_for', playerId: id, actions: actionsNew });
        this.tryOld({ type: 'submit_for', playerId: this.oldId(id), actions: actionsOld });
      }
    }
  }

  oldChoice(c: Choice): OldChoice {
    const values = c.values.map((v) => this.oldId(v));
    return c.decline ? { decline: true, values } : { values };
  }

  mapFields(old: { fields: { options: string[] }[] }) {
    return old.fields.map((f) => f.options.map((o) => this.newId(o)).sort());
  }

  choose(spec: ActionSpec): Choice {
    const stuck = spec.fields.some((f) => f.options.length === 0);
    if (stuck || (spec.allowDecline && this.rng.next() < 0.25)) return { decline: true, values: [] };
    const used: string[] = [];
    const values = spec.fields.map((f) => {
      const pool = spec.distinct ? f.options.filter((o) => !used.includes(o)) : f.options;
      const v = this.rng.pick(pool.length ? pool : f.options);
      used.push(v);
      return v;
    });
    if (spec.distinct && new Set(values).size !== values.length) return { decline: true, values: [] };
    return { values };
  }

  /** The option in new terms: redirect:x and role:x are the old spellings. */
  normal(option: string): string {
    return this.newId(option.replace(/^(redirect|role):/, ''));
  }

  /** Works through every open question and decision until the night has nothing left to ask. */
  settle(at: string) {
    for (let guard = 0; guard < 80; guard++) {
      const oldRes = oldResolve(this.old, this.now);
      const res = resolveNight(this.next);
      const olds = oldRes.reviewItems.filter((d) => d.chosen === null);
      const news = res.decisions.filter((d) => d.chosen === null && !d.stale);
      const qOld = oldRes.followUps.filter((q) => !q.answered);
      const qNew = res.questions.filter((q) => !q.answered);
      if (!olds.length && !news.length && !qOld.length && !qNew.length) return;

      // What both engines ask comes first: settling it can change what else is asked.
      const q = qNew.find((x) => this.questionPartner(x, qOld));
      if (q) {
        const o = this.questionPartner(q, qOld) as OldFollowUp;
        this.answered += 1;
        const choice = this.choose(q.spec);
        this.c({ type: 'answer_question_for', key: q.key, choice });
        this.o({ type: 'answer_follow_up_for', key: o.key, choice: this.oldChoice(choice) });
        continue;
      }
      const first = news.find((d) => this.partner(d, olds));
      if (first) {
        const pair = this.partner(first, olds) as OldReviewItem;
        const options = first.options.map((x) => x.id).filter((x) => pair.options.some((y) => this.normal(y.id) === x));
        const pick = options.length ? this.rng.pick(options) : first.default;
        const oldOption = pair.options.find((y) => this.normal(y.id) === pick)?.id ?? pair.default;
        this.decided += 1;
        if (this.trace) console.log('DECIDE', first.key.kind, pick, oldOption, res.log.join(' / '));
        this.c({ type: 'decide', key: first.key, option: pick });
        this.o({ type: 'choose_review', key: pair.key, optionId: oldOption });
        continue;
      }

      // Anything left is asked by one engine only.
      const loneNew = news[0];
      if (loneNew) {
        this.diff(at, `decision only in new: ${loneNew.key.kind}`, null, loneNew.title);
        this.c({ type: 'decide', key: loneNew.key, option: loneNew.default });
        continue;
      }
      const loneOld = olds[0];
      if (loneOld) {
        this.diff(at, `decision only in old: ${loneOld.kind}`, loneOld.title, null);
        this.o({ type: 'choose_review', key: loneOld.key, optionId: loneOld.default });
        continue;
      }
      const askNew = qNew[0];
      if (askNew) {
        this.diff(at, `question only in new: ${askNew.roleId}`, null, askNew.playerId);
        this.c({ type: 'answer_question_for', key: askNew.key, choice: this.choose(askNew.spec) });
        continue;
      }
      const askOld = qOld[0];
      if (askOld) {
        this.diff(at, `question only in old: ${askOld.roleId}`, askOld.playerId, null);
        const values = askOld.spec.fields.map((f) => f.options[0] as string);
        this.o({ type: 'answer_follow_up_for', key: askOld.key, choice: { values } });
      }
    }
    throw new Error(`seed ${this.seed}: decisions never settled at ${at}`);
  }

  questionPartner(q: { playerId: string; roleId: string }, olds: OldFollowUp[]) {
    return olds.find((x) => this.newId(x.playerId) === q.playerId && x.roleId === q.roleId);
  }

  partner(d: ReviewItem, olds: OldReviewItem[]) {
    const same = olds.filter((o) => o.kind === d.key.kind);
    if (same.length <= 1) return same[0];
    // Several of a kind: the title names the same people on both sides.
    const norm = (t: string) => t.replace(/P\d+/g, (m) => m.toLowerCase());
    return same.find((o) => norm(o.title) === norm(d.title)) ?? same[0];
  }

  compareNight(at: string) {
    const oldRes = oldResolve(this.old, this.now);
    const res = resolveNight(this.next);
    this.nights += 1;
    if (this.trace) {
      console.log([at, 'OLD', ...oldRes.log, 'NEW', ...res.log].join(' | '));
    }
    this.deaths += res.deaths.length;
    this.lines += res.results.reduce((n, r) => n + r.truth.length, 0);
    const lines = (rows: { playerId: string; lines: string[] }[]) =>
      Object.fromEntries(
        this.ids.map((id) => [
          id,
          rows
            .filter((r) => r.playerId === id)
            .flatMap((r) => r.lines)
            .sort(),
        ]),
      );
    this.diff(
      at,
      'true lines',
      lines(oldRes.results.map((r) => ({ playerId: this.newId(r.playerId), lines: r.trueLines }))),
      lines(res.results.map((r) => ({ playerId: r.playerId, lines: r.truth }))),
    );
    this.diff(at, 'deaths', oldRes.deaths.map((x) => this.newId(x)).sort(), [...res.deaths].sort());
    this.diff(at, 'revived', oldRes.revived.map((x) => this.newId(x)).sort(), [...res.revived].sort());
    this.diff(
      at,
      'result impairment',
      oldRes.results.map((r) => `${this.newId(r.playerId)}:${r.roleId}:${r.impaired}`).sort(),
      res.results.map((r) => `${r.playerId}:${r.roleId}:${r.impaired}`).sort(),
    );
  }

  compareWorld(at: string) {
    const night = Math.max(0, this.old.nightNumber);
    const imp = oldImpairment(this.old, night);
    const now = computeImpairment(this.next, phaseMoment(this.next));
    for (const id of this.ids) {
      const o = this.oldId(id);
      const p = this.next.players[id];
      this.diff(at, `alive:${id}`, this.old.players.find((x) => x.id === o)?.alive, p?.life.alive);
      this.diff(at, `character:${id}`, this.old.assignments[o]?.roleId, p?.character);
      this.diff(at, `alignment:${id}`, this.old.assignments[o]?.alignment, p?.alignment);
      this.diff(at, `impaired:${id}`, !!imp[o]?.impaired, !!now[id]?.impaired);
    }
  }

  // ---- day ----
  ability(role: string) {
    return Object.values(this.next.abilities).find((a) => a.roleId === role && a.activeUntil !== 'removed');
  }

  day(at: string) {
    const rng = this.rng;
    const alive = this.ids.filter((id) => this.next.players[id]?.life.alive);
    const seatedPick = () => rng.pick(this.ids);
    const fact = (key: string, value: unknown) => this.tryOld({ type: 'set_day_fact', key, value });
    const act = (role: string, action: string, values: string[], mode: 'accept' = 'accept') => {
      for (const a of Object.values(this.next.abilities)) {
        if (a.roleId !== role) continue;
        if (this.tryNew({ type: 'day_action', abilityId: a.id, action, values, mode })) return true;
      }
      return false;
    };
    const dead = this.ids.filter((id) => !this.next.players[id]?.life.alive);
    if (rng.coin()) {
      const v = rng.coin();
      if (act('flowergirl', 'demon_voted', [v ? 'yes' : 'no'])) fact('demonVoted', v);
    }
    if (rng.coin()) {
      const v = rng.int(6);
      if (act('juggler', 'count', [String(v)])) fact('jugglerCorrect', v);
    }
    if (rng.coin()) {
      const v = rng.pick(['none', 'true', 'false']);
      if (act('gossip', 'statement', [v])) fact('gossipStatement', v);
    }
    if (rng.coin() && alive.length) {
      const t = seatedPick();
      if (act('mezepheles', 'sayer', [t])) fact('mezephelesSayer', this.oldId(t));
    }
    if (dead.length && alive.length && rng.coin()) {
      const t = rng.pick(alive);
      if (act('moonchild', 'target', [t])) fact('moonchildTargetId', this.oldId(t));
    }
    const slayer = this.ability('slayer');
    if (slayer && slayer.holder.kind === 'player' && rng.next() < 0.3) {
      const t = seatedPick();
      if (this.tryNew({ type: 'day_action', abilityId: slayer.id, action: 'shoot', values: [t], mode: 'accept' })) {
        this.tryOld({
          type: 'day_kill',
          kind: 'slayer',
          sourceId: this.oldId(slayer.holder.id),
          targetId: this.oldId(t),
          mode: 'accept',
        });
      }
    }
    if (rng.next() < 0.3) {
      const t = seatedPick();
      if (act('damsel', 'guess', [t])) this.tryOld({ type: 'damsel_guess', targetId: this.oldId(t) });
    }
    this.prompts();
    this.compareWorld(`${at} before execution`);
    if (rng.next() < 0.7 && alive.length) {
      const t = rng.pick(alive);
      this.c({ type: 'record_execution', playerId: t, died: true });
      this.o({ type: 'record_execution', playerId: this.oldId(t), died: true });
    } else {
      this.c({ type: 'record_execution', playerId: null, died: false });
      this.o({ type: 'record_execution', playerId: null, died: false });
    }
    this.prompts();
    this.compareWorld(`${at} after execution`);
  }

  /** The Storyteller's day prompts: only those both engines ask are compared. */
  prompts() {
    const pending = this.next.prompts.length;
    this.diff('day', 'prompts', this.old.dayPrompts.length, pending);
    for (const q of [...this.next.prompts]) {
      const yes = this.rng.coin();
      this.c({ type: 'resolve_prompt', id: q.id, option: yes ? 'yes' : 'no' });
      const o = this.old.dayPrompts[0];
      if (o) this.o({ type: 'resolve_day_prompt', id: o.id, accept: yes });
    }
  }

  play(maxNights = 6) {
    const stopAtDiff = this.trace;
    const roles = this.cast();
    this.setup(roles);
    for (let night = 0; night < maxNights; night++) {
      const at = `night ${night} [${roles.join(' ')}]`;
      this.submit(at);
      this.o({ type: 'resolve_night', force: true });
      this.c({ type: 'close_collecting', force: true });
      this.settle(at);
      this.compareNight(at);
      this.o({ type: 'publish_night', force: true });
      this.c({ type: 'publish_dawn', force: true });
      this.compareWorld(`dawn ${night}`);
      if (stopAtDiff && this.diffs.length) return;
      this.day(`day ${night + 1}`);
      if (stopAtDiff && this.diffs.length) return;
      if (this.ids.filter((id) => this.next.players[id]?.life.alive).length < 2) return;
      this.o({ type: 'start_night', force: true });
      this.c({ type: 'start_night' });
    }
  }
}
