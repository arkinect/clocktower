// A seeded generator of legal-looking commands, used by the tests that play random games.
import { expect } from 'vitest';
import type { Command, PlayerId, RoleId } from '@ct/protocol';
import { actionSpecs, resolveNight, type GameStateT } from '../../src';
import { makeRng, type Rng } from '../../src/util/rng';
import { TestGame, pid, ST } from './game';
import { TRAVELLER } from './plain';

/** How many random games a test plays, and the first of their seeds (the nightly run starts somewhere new). */
export const FUZZ_GAMES = Number(process.env['FUZZ_GAMES'] ?? 100);
const FIRST_SEED = Number(process.env['FUZZ_SEED'] ?? 1);

const NAMES = 'Ann Bo Cy Di Ed Flo Gus Hal Ivy Jo Kim Lee Max Nia Oz'.split(' ');

/** Who sends what. A night choice is made up only once it is picked: working out everyone's is slow. */
type Sent = [PlayerId | null, Command | (() => Command)];

export function seatedIds(s: GameStateT): PlayerId[] {
  return s.seats.filter((x) => x.left === null).map((x) => x.playerId);
}

/** One random value for each field, or nothing for a field with no options. */
const randomValues = (fields: readonly { options: readonly string[] }[], rng: Rng) =>
  fields.map((f) => (f.options.length ? rng.pick(f.options) : ''));

/** Night submissions for a player: random legal choices, sometimes a decline. */
export function randomActions(s: GameStateT, id: PlayerId, rng: Rng) {
  const actions: Record<string, { values: string[]; decline?: boolean; mode?: string }> = {};
  for (const spec of actionSpecs(s, id)) {
    const stuck = spec.fields.some((f) => f.options.length === 0);
    if (spec.allowDecline && (stuck || rng.next() < 0.1)) {
      actions[spec.key] = { decline: true, values: [] };
      continue;
    }
    const used: string[] = [];
    const values = spec.fields.map((f) => {
      const pool = spec.distinct ? f.options.filter((o) => !used.includes(o)) : f.options;
      const v = f.options.length ? rng.pick(pool.length ? pool : f.options) : '';
      used.push(v);
      return v;
    });
    actions[spec.key] = { values, ...(spec.modes ? { mode: rng.pick(spec.modes).id } : {}) };
  }
  return actions;
}

/** Commands that move the game along, with some a player may not send. */
function moves(g: TestGame, script: readonly RoleId[], rng: Rng): Sent[] {
  const s = g.state;
  const ids = seatedIds(s);
  const anyone = [...s.players.keys()].filter((id) => id !== ST);
  const p = () => rng.pick(ids.length ? ids : anyone.length ? anyone : [ST]);
  const out: Sent[] = [];
  const st = (c: Command) => out.push([ST, c]);
  const kind = s.phase.kind;
  const join = (id: PlayerId, name: string, wantsStoryteller: boolean) =>
    out.push([null, { type: 'join', id, name, rolePreference: 'none', wantsStoryteller }]);
  if (!s.players.has(ST)) join(ST, 'Storyteller', rng.coin());
  else if (!s.storytellerId) out.push([ST, { type: 'claim_storyteller' }]);
  // Garbage from anyone, always.
  out.push([rng.pick(anyone.length ? anyone : [ST]), { type: 'open_setup' }]);
  out.push([p(), { type: 'seen_role' }]);
  const name = NAMES.find((n) => !s.players.has(pid(n)));
  // Someone who arrives once the game is on has no seat, and can only become a Traveller.
  if (name && (kind === 'lobby' || kind === 'setup' || rng.int(10) === 0)) join(pid(name), name, false);
  if (kind === 'lobby' || kind === 'setup') {
    st({ type: 'open_setup' });
    if (kind === 'setup') {
      st({ type: 'set_script', roleIds: [...script] });
      st({ type: 'randomise_seating' });
      st({ type: 'suggest_distribution' });
      st({ type: 'suggest_distribution' });
      st({ type: 'suggest_bluffs' });
      st({ type: 'begin_first_night', force: rng.coin() });
      if (ids.length >= 5) st({ type: 'begin_first_night', force: true });
    }
  }
  if (kind === 'night') {
    const ph = s.phase as Extract<GameStateT['phase'], { kind: 'night' }>;
    st({ type: 'open_collecting' });
    for (const id of ids) {
      if (ph.submissions.get(id)) continue;
      out.push([id, () => ({ type: 'submit_night', actions: randomActions(s, id, rng) })]);
    }
    st({ type: 'mark_no_action', playerId: p() });
    st({ type: 'close_collecting', force: rng.next() < 0.5 });
    if (ph.stage === 'review') {
      st({ type: 'accept_all_defaults' });
      st({ type: 'publish_dawn', force: true });
      st({ type: 'publish_dawn', force: true });
      st({ type: 'adjust_malfunctions', add: [p()], remove: [] });
    }
  }
  if (kind === 'day') {
    st({ type: 'record_nomination', nominator: p(), nominee: p() });
    st({ type: 'record_vote', nominee: p(), count: rng.int(8), voters: null });
    st({ type: 'record_execution', playerId: rng.int(5) ? p() : null, died: rng.next() < 0.7 });
    st({ type: 'record_statement', playerId: p(), text: 'I say so.' });
    st({ type: 'mark_alive', playerId: p(), alive: rng.coin() });
    out.push([p(), { type: 'use_ghost_vote' }]);
    st({ type: 'set_notes', text: `note ${rng.int(99)}` });
    st({ type: 'start_night', force: rng.coin() });
    st({ type: 'start_night', force: true });
    for (const q of s.gameEnd) st({ type: rng.coin() ? 'confirm_game_end' : 'dismiss_game_end', key: q.key });
  }
  if (kind === 'ended') st({ type: 'play_again' });
  for (const q of s.prompts) st({ type: 'resolve_prompt', id: q.id, option: rng.pick(q.options).id });
  return out;
}

/** What the Storyteller may change by hand. */
function byHand(g: TestGame, script: readonly RoleId[], rng: Rng): Sent[] {
  const s = g.state;
  const ids = seatedIds(s);
  if (!ids.length || s.storytellerId !== ST) return [];
  const p = () => rng.pick(ids);
  const role = () => rng.pick(script);
  const out: Sent[] = [];
  const st = (c: Command | (() => Command)) => out.push([ST, c]);
  const kind = s.phase.kind;
  if (rng.int(60) === 0) {
    st({ type: 'end_game', winner: rng.pick(['good', 'evil', null] as const) });
    st({ type: 'force_phase', phase: rng.pick(['setup', 'day', 'ended'] as const) });
    st({ type: 'new_game' });
    return out;
  }
  st({ type: 'set_settings', announceDeaths: rng.coin(), notifyOnRoleChange: rng.coin() });
  if (kind === 'setup') {
    st({ type: 'rename_player', playerId: p(), name: rng.pick(NAMES) });
    st({ type: 'set_seating', order: rng.shuffle(ids) });
    st({ type: 'assign_many', assignments: { [p()]: role(), [p()]: role() } });
    st({ type: 'set_type_counts', counts: rng.coin() ? null : [3, 0, 1, 1] });
    st({ type: 'remove_player', playerId: p() });
  }
  if (kind === 'setup' || kind === 'night' || kind === 'day') {
    st({ type: 'assign_character', playerId: p(), roleId: rng.int(8) ? role() : null });
    st({ type: 'set_alignment', playerId: p(), alignment: rng.coin() ? 'good' : 'evil' });
    st({ type: 'set_believed', playerId: p(), roleId: rng.int(4) ? role() : null });
    st({ type: 'set_bluffs', roleIds: rng.shuffle(script).slice(0, 3) });
    // The app has no Fabled or Loric yet, so only an empty list is taken.
    st({ type: 'set_storyteller_characters', roleIds: rng.coin() ? [] : [role()] });
    st({ type: 'publish_seating' });
    const traveller = ids.find((id) => s.players.get(id)?.character === TRAVELLER[0]);
    const unseated = [...s.players.keys()].filter((id) => id !== ST && !ids.includes(id));
    if (traveller) {
      st({ type: 'exile_traveller', playerId: traveller });
      st({ type: 'remove_traveller', playerId: traveller });
    } else if (unseated.length) {
      const alignment = rng.coin() ? 'good' : 'evil';
      st({ type: 'add_traveller', playerId: rng.pick(unseated), roleId: TRAVELLER[0] as RoleId, alignment });
    }
  }
  if (kind === 'night' || kind === 'day') {
    const abilities = [...s.abilities.keys()];
    if (abilities.length) st({ type: 'set_ability_used', abilityId: rng.pick(abilities), used: rng.coin() });
    st({ type: 'add_condition', target: p(), condition: rng.pick(['drunk', 'poisoned', 'mad'] as const) });
    if (s.conditions.length) st({ type: 'remove_condition', conditionId: rng.pick(s.conditions).id });
    st({ type: 'mark_alive', playerId: p(), alive: rng.coin() });
    st({ type: 'set_ghost_vote', playerId: p(), used: rng.coin() });
    out.push([p(), { type: 'use_ghost_vote' }]);
  }
  if (kind === 'night') {
    const who = p();
    st(() => ({ type: 'submit_for', playerId: who, actions: randomActions(s, who, rng) }));
    st({ type: 'clear_submission', playerId: p() });
    st({ type: 'reopen_collecting' });
    st({ type: 'extend_countdown', seconds: 10 });
  }
  if (kind === 'day') st({ type: 'record_broke_madness', playerId: p(), ruling: 'They did.' });
  return out;
}

/** Answers to what the console asks: setup fields, day abilities, and the night in review. */
function answers(g: TestGame, rng: Rng): Sent[] {
  if (g.state.storytellerId !== ST) return [];
  const { setup, dayActions, review } = g.grimoire();
  const out: Sent[] = [];
  // The rarer ones are sent more often when there are any.
  const st = (c: Command, times = 1) => {
    for (let i = 0; i < times; i++) out.push([ST, c]);
  };
  for (const f of setup.fields) {
    const value = f.options.length ? rng.pick(f.options).id : null;
    st({ type: 'set_setup_field', abilityId: f.abilityId, field: f.field, value });
    if (f.suggestible) st({ type: 'suggest_setup_field', abilityId: f.abilityId, field: f.field });
  }
  for (const d of dayActions) {
    const values = rng.int(6) ? randomValues(d.fields, rng) : [];
    const mode = rng.pick(['preview', 'accept', 'accept', 'force_success', 'force_fail'] as const);
    st({ type: 'day_action', abilityId: d.abilityId, action: d.action, values, mode });
  }
  for (const d of review?.decisions ?? []) {
    const option = rng.int(8) && d.options.length ? rng.pick(d.options).id : null;
    st({ type: 'decide', key: d.key, option });
  }
  for (const q of review?.questions ?? []) {
    const choice = { values: randomValues(q.spec.fields, rng) };
    st({ type: 'answer_question_for', key: q.key, choice }, 3);
    for (let i = 0; i < 3; i++) out.push([q.playerId, { type: 'answer_question', key: q.key, choice }]);
  }
  for (const f of review?.facts ?? []) {
    const values = rng.int(6) ? randomValues(f.fields, rng) : [];
    st({ type: 'record_fact', abilityId: f.abilityId, action: f.action, values }, 4);
  }
  if (review?.results.length) {
    const lines = rng.int(3) ? ['Changed.'] : null;
    st({ type: 'override_result', resultKey: rng.pick(review.results).key, lines });
  }
  return out;
}

/** What dawn copies back from a resolved night. Must be what `publish` in phases/night.ts copies. */
export const CARRIED = ['players', 'abilities', 'conditions', 'seats', 'setup', 'idSeq'] as const;

/** A resolution kept past a command must be the one the night would come to now, or dawn undoes the command. */
export function assertKeptResolution(state: GameStateT) {
  if (state.phase.kind !== 'night') return;
  const told = (s: GameStateT) => {
    const { after, ...rest } = resolveNight(s);
    return { ...rest, after: Object.fromEntries(CARRIED.map((k) => [k, after[k]])) };
  };
  // A copy has no resolution of its own yet, so its night is worked out afresh.
  expect(told(state), 'the kept resolution').toEqual(told(structuredClone(state)));
}

export interface FuzzResult {
  game: TestGame;
  rejected: number;
}

/**
 * Runs a random game, calling `check` after every accepted command. A table of 5 to 15 sits down first, but every
 * tenth game starts from an empty lobby and may stay too small to be legal.
 */
export function fuzzGame(
  seed: number,
  steps: number,
  script: readonly RoleId[],
  check: (g: TestGame, command: Command) => void,
): FuzzResult {
  const rng = makeRng(seed);
  const g = new TestGame(`F${seed}`);
  g.seed = (seed * 7919) % 2 ** 31;
  g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
  if (seed % 10) {
    for (const name of NAMES.slice(0, 5 + (seed % 11))) {
      g.as(null, { type: 'join', id: pid(name), name, rolePreference: 'none', wantsStoryteller: false });
    }
    g.st({ type: 'open_setup' }).st({ type: 'set_script', roleIds: [...script] });
    g.st({ type: 'randomise_seating' });
  }
  let rejected = 0;
  for (let i = 0; i < steps; i++) {
    const kind = rng.int(5);
    const change = kind === 0 ? byHand(g, script, rng) : kind === 1 ? answers(g, rng) : [];
    const [actor, made] = rng.pick(change.length ? change : moves(g, script, rng));
    const command = typeof made === 'function' ? made() : made;
    const res = g.tryAs(actor, command);
    if (res.ok) {
      if (!res.resolutionChanged) assertKeptResolution(g.state);
      check(g, command);
    } else if (res.internal) throw new Error(`step ${i} ${command.type}`, { cause: res.cause });
    else rejected += 1;
  }
  return { game: g, rejected };
}

/** Plays this many seeds in one test, and says which one failed. */
export function eachSeed(games: number, play: (seed: number) => void, first = FIRST_SEED) {
  for (let seed = first; seed < first + games; seed++) {
    try {
      play(seed);
    } catch (e) {
      throw new Error(`Seed ${seed}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }
}
