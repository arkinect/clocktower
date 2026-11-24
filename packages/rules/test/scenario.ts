// The scenario language: a game described by its cast, driven one night and day at a time.
import { inMode, roleId, type AbilityId, type Choice, type PlayerId, type RoleId } from '@ct/protocol';
import { defaultScript, resolveNight } from '../src';
import { computeImpairment } from '../src';
import { phaseMoment } from '../src/model/state';
import { pid, seated, ST, TestGame } from './helpers/game';
import { DEMON, MINION, OUT, PLAIN_SCRIPT, TOWN } from './helpers/plain';

const SHORT: Record<string, RoleId> = Object.fromEntries([
  ...TOWN.map((r, i) => [`t${i + 1}`, r]),
  ...OUT.map((r, i) => [`o${i + 1}`, r]),
  ...MINION.map((r, i) => [`m${i + 1}`, r]),
  ...DEMON.map((r, i) => [`d${i + 1}`, r]),
]);

const toRole = (id: string): RoleId => SHORT[id] ?? roleId(id);

export interface SceneOptions {
  /** What a player was told they are: { ann: 'empath' } for a Drunk. */
  believed?: Record<string, string>;
  /** Setup fields, by role: { fortune_teller: { herring: 'bo' } }. */
  fields?: Record<string, Record<string, string>>;
  extra?: string[];
  evilInfoPolicy?: 'house' | 'official' | 'teensyville';
}

type Pick = string[] | Record<string, string[]>;

export class Scene {
  g: TestGame;
  readonly ids: PlayerId[];
  private readonly names: string[];

  /** The names are the seats, in order. Use the short names t1-t9, o1-o3, m1-m3 and d1-d2 for plain characters. */
  constructor(chars: Record<string, string>, o: SceneOptions = {}) {
    const names = Object.keys(chars);
    const cast = Object.values(chars).map(toRole);
    const script = [...new Set([...defaultScript(), ...PLAIN_SCRIPT, ...cast, ...(o.extra ?? []).map(toRole)])];
    this.g = seated(names, script);
    this.names = names;
    this.ids = names.map(pid);
    names.forEach((n, i) => this.g.st({ type: 'assign_character', playerId: pid(n), roleId: cast[i] as RoleId }));
    for (const [n, r] of Object.entries(o.believed ?? {})) {
      this.g.st({ type: 'set_believed', playerId: pid(n), roleId: toRole(r) });
    }
    for (const [role, fields] of Object.entries(o.fields ?? {})) {
      for (const [field, value] of Object.entries(fields)) {
        this.g.st({ type: 'set_setup_field', abilityId: this.ability(role), field, value: this.value(value) });
      }
    }
    if (o.evilInfoPolicy) this.g.st({ type: 'set_settings', evilInfoPolicy: o.evilInfoPolicy });
  }

  /** A value as the engine knows it: a player's name becomes their id, and a short role name its role. */
  value = (v: string): string => {
    if (SPECIAL.has(v)) return SHORT[v] as string;
    return this.names.includes(v) ? pid(v) : v;
  };

  get state() {
    return this.g.state;
  }

  /** The id of a role's first ability instance, optionally on one holder. */
  ability(role: string, holder?: string): AbilityId {
    const a = [...this.state.abilities.values()].find(
      (x) => x.roleId === toRole(role) && (!holder || (x.holder.kind === 'player' && x.holder.id === pid(holder))),
    );
    if (!a) throw new Error(`No ability ${role}${holder ? ` on ${holder}` : ''}`);
    return a.id;
  }

  /** Into Night 0's collecting. */
  start() {
    this.g.st({ type: 'begin_first_night', force: true });
    this.g.st({ type: 'open_collecting' });
    return this;
  }

  get night() {
    const p = this.state.phase;
    if (p.kind !== 'night') throw new Error(`Not a night: ${p.kind}`);
    return p;
  }

  /**
   * Night actions by player id. A list answers their first picker, [] declines it. A rows picker takes every row. A
   * picker with modes takes its first, unless the list starts with another's id (['kill', 'bo']).
   */
  submit(picks: Record<string, Pick>) {
    for (const [id, pick] of Object.entries(picks)) {
      const specs = this.g.view(pid(id)).me.actions;
      const actions: Record<string, Choice> = {};
      const choose = (asked: (typeof specs)[number], list: string[]): Choice => {
        if (!list.length) return { decline: true, values: [] };
        const named = asked.modes?.some((m) => m.id === list[0]);
        const mode = named ? list[0] : asked.modes?.[0]?.id;
        const values = named ? list.slice(1) : list;
        const spec = inMode(asked, mode);
        return {
          values: (spec.maxRows ? values : spec.fields.map((_, i) => values[i] as string)).map(this.value),
          ...(mode ? { mode } : {}),
        };
      };
      if (Array.isArray(pick)) {
        const spec = specs[0];
        if (!spec) throw new Error(`${id} has no picker tonight`);
        actions[spec.key] = choose(spec, pick);
      } else {
        for (const [role, values] of Object.entries(pick)) {
          const spec = specs.find((s) => s.roleId === toRole(role));
          if (!spec) throw new Error(`${id} has no ${role} picker tonight`);
          actions[spec.key] = choose(spec, values);
        }
      }
      this.g.st({ type: 'submit_for', playerId: pid(id), actions });
    }
    return this;
  }

  specs(id: string) {
    return this.g.view(pid(id)).me.actions;
  }

  get res() {
    return resolveNight(this.state);
  }

  review() {
    if (this.night.stage !== 'review') this.g.st({ type: 'close_collecting', force: true });
    return this;
  }

  /** The Storyteller's choice on a decision the night asks. */
  decide(kind: string, option: string, subject?: string) {
    this.review();
    const d = this.decision(kind, subject);
    this.g.st({ type: 'decide', key: d.key, option: this.value(option) });
    return this;
  }

  decision(kind: string, subject?: string) {
    const d = this.res.decisions.find(
      (x) => x.key.kind === kind && (!subject || x.key.subject === this.value(subject)),
    );
    if (!d) throw new Error(`No decision ${kind}. Have: ${this.res.decisions.map((x) => x.key.kind).join(', ')}`);
    return d;
  }

  hasDecision(kind: string) {
    return this.res.decisions.some((x) => x.key.kind === kind);
  }

  /** A follow-up question, answered by the player it was put to. */
  answer(id: string, values: string[]) {
    this.review();
    const q = this.res.questions.find((x) => x.playerId === pid(id) && !x.answered);
    if (!q) throw new Error(`No open question for ${id}`);
    this.g.as(pid(id), {
      type: 'answer_question',
      key: q.key,
      choice: values.length ? { values: values.map(this.value) } : { decline: true, values: [] },
    });
    return this;
  }

  /** The finished results for a player tonight. */
  truth(id: string): string[] {
    return this.res.results.filter((r) => r.playerId === pid(id)).flatMap((r) => r.truth);
  }

  final(id: string): string[] {
    return this.res.results.filter((r) => r.playerId === pid(id)).flatMap((r) => r.final);
  }

  row(id: string) {
    const row = this.res.results.find((r) => r.playerId === pid(id));
    if (!row) throw new Error(`No result for ${id}`);
    return row;
  }

  dawn() {
    this.review();
    this.g.st({ type: 'publish_dawn', force: true });
    return this;
  }

  /** Dawn, then the end of the day and the next night's collecting. */
  nextNight() {
    if (this.state.phase.kind === 'night') this.dawn();
    return this.dusk();
  }

  dusk() {
    this.g.st({ type: 'start_night' });
    if (this.night.stage !== 'collecting') this.g.st({ type: 'open_collecting' });
    return this;
  }

  /** Chooses today's execution, which happens at dusk. */
  execute(id: string | null, died = true) {
    this.g.st({ type: 'record_execution', playerId: id === null ? null : pid(id), died });
    return this;
  }

  /** The Storyteller marks a player dead, now. */
  kill(id: string) {
    this.g.st({ type: 'mark_alive', playerId: pid(id), alive: false });
    return this;
  }

  nominate(by: string, of: string) {
    this.g.st({ type: 'record_nomination', nominator: pid(by), nominee: pid(of) });
    return this;
  }

  /** Runs a Storyteller day action on a holder's ability. */
  act(
    role: string,
    action: string,
    values: string[],
    o: { holder?: string; mode?: 'accept' | 'preview' | 'force_success' | 'force_fail' } = {},
  ) {
    this.g.st({
      type: 'day_action',
      abilityId: this.ability(role, o.holder),
      action,
      values: values.map(this.value),
      mode: o.mode ?? 'accept',
    });
    return this.g.data as { summary: string; effective: boolean };
  }

  dayActions() {
    return this.g.grimoire().dayActions;
  }

  prompt(option: string) {
    const q = this.state.prompts[0];
    if (!q) throw new Error('No prompt');
    this.g.st({ type: 'resolve_prompt', id: q.id, option: this.value(option) });
    return this;
  }

  alive(id: string) {
    return this.g.player(pid(id)).life.alive;
  }

  dead(...ids: string[]) {
    return ids.every((id) => !this.alive(id));
  }

  character(id: string) {
    return this.g.player(pid(id)).character;
  }

  alignment(id: string) {
    return this.g.player(pid(id)).alignment;
  }

  impaired(id: string) {
    return computeImpairment(this.state, phaseMoment(this.state))[pid(id)]?.impaired ?? false;
  }

  /** Every line this player has been sent. */
  inbox(id: string): string[] {
    return this.g.view(pid(id)).me.messages.flatMap((m) => [m.title, ...m.lines]);
  }

  winners() {
    return this.state.gameEnd.map((q) => q.winner);
  }
}

const SPECIAL = new Set(Object.keys(SHORT));

export const scene = (chars: Record<string, string>, o?: SceneOptions) => new Scene(chars, o);
export { ST, toRole };
