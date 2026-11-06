// A seeded generator of legal-looking commands, used by the fuzz and invariant tests.
import type { Command, PlayerId, RoleId } from '@ct/protocol';
import { actionSpecs, type GameStateT } from '../../src';
import { makeRng, type Rng } from '../../src/util/rng';
import { TestGame, pid, ST } from './game';

const NAMES = 'Ann Bo Cy Di Ed Flo Gus Hal Ivy Jo Kim Lee Max Nia Oz'.split(' ');

export function seatedIds(s: GameStateT): PlayerId[] {
  return s.seats.filter((x) => x.left === null).map((x) => x.playerId);
}

/** Night submissions for a player: random legal choices, sometimes a decline. */
export function randomActions(s: GameStateT, id: PlayerId, rng: Rng) {
  const actions: Record<string, { values: string[]; decline?: boolean }> = {};
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
    actions[spec.key] = { values };
  }
  return actions;
}

export function generators(g: TestGame, script: readonly RoleId[], rng: Rng): [PlayerId | null, Command][] {
  const s = g.state;
  const ids = seatedIds(s);
  const anyone = (Object.keys(s.players) as PlayerId[]).filter((id) => id !== ST);
  const p = () => rng.pick(ids.length ? ids : anyone.length ? anyone : [ST]);
  const out: [PlayerId | null, Command][] = [];
  const st = (c: Command) => out.push([ST, c]);
  const kind = s.phase.kind;
  const role = () => rng.pick(script);
  // Garbage from anyone, always.
  out.push([rng.pick(anyone.length ? anyone : [ST]), { type: 'open_setup' }]);
  out.push([p(), { type: 'seen_role' }]);
  if (kind === 'lobby' || kind === 'setup') {
    if (anyone.length < 15) {
      const n = NAMES[anyone.length] as string;
      out.push([null, { type: 'join', id: pid(n), name: n, rolePreference: 'none', wantsStoryteller: false }]);
    }
    st({ type: 'open_setup' });
    if (kind === 'setup') {
      st({ type: 'set_script', roleIds: [...script] });
      st({ type: 'randomise_seating' });
      st({ type: 'suggest_distribution' });
      st({ type: 'suggest_distribution' });
      st({ type: 'suggest_bluffs' });
      st({ type: 'assign_character', playerId: p(), roleId: role() });
      st({ type: 'begin_first_night', force: rng.coin() });
      if (ids.length >= 5) st({ type: 'begin_first_night', force: true });
    }
  }
  if (kind === 'night') {
    const ph = s.phase as Extract<GameStateT['phase'], { kind: 'night' }>;
    st({ type: 'open_collecting' });
    for (const id of ids) {
      if (!ph.submissions[id]) out.push([id, { type: 'submit_night', actions: randomActions(s, id, rng) }]);
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
    const a = p();
    const b = p();
    st({ type: 'record_nomination', nominator: a, nominee: b });
    st({ type: 'record_vote', nominee: b, count: rng.int(8), voters: null });
    st({ type: 'record_execution', playerId: b, died: rng.next() < 0.7 });
    st({ type: 'record_statement', playerId: a, text: 'I say so.' });
    st({ type: 'mark_alive', playerId: a, alive: rng.coin() });
    out.push([a, { type: 'use_ghost_vote' }]);
    st({ type: 'set_notes', text: `note ${rng.int(99)}` });
    st({ type: 'start_night' });
    st({ type: 'start_night' });
    for (const q of s.gameEnd) st({ type: rng.coin() ? 'confirm_game_end' : 'dismiss_game_end', key: q.key });
  }
  if (kind === 'ended') st({ type: 'play_again' });
  for (const q of s.prompts) st({ type: 'resolve_prompt', id: q.id, option: rng.pick(q.options).id });
  return out;
}

export interface FuzzResult {
  game: TestGame;
  rejected: number;
}

/** Runs a random game, calling `check` after every accepted command. */
export function fuzzGame(
  seed: number,
  steps: number,
  script: readonly RoleId[],
  check: (g: TestGame, command: Command) => void,
): FuzzResult {
  const rng = makeRng(seed);
  const g = new TestGame(`F${seed}`);
  g.seed = seed * 7919;
  g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
  let rejected = 0;
  for (let i = 0; i < steps; i++) {
    const [actor, command] = rng.pick(generators(g, script, rng));
    const res = g.tryAs(actor, command);
    if (res.ok) check(g, command);
    else if (res.internal) throw new Error(`seed ${seed} step ${i} ${command.type}: ${res.error}`);
    else rejected += 1;
  }
  return { game: g, rejected };
}
