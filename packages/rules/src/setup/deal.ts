// Autoplay's deal: a complete, legal, random setup that nobody sees. The characters are drawn first, so they follow the
// counts and never who asked for what. Then who gets which, what they believe, and every other choice of the setup.
import type { CharacterType, PlayerId, RoleId } from '@ct/protocol';
import { PLAYER_TYPES, roleDef } from '../abilities/registry';
import { Reader } from '../derive/reader';
import { SETUP_MOMENT, type GameState } from '../model/state';
import { HookCtx } from '../night/context';
import { Run } from '../night/run';
import { clone } from '../util/clone';
import { subRng, type Rng } from '../util/rng';
import {
  baseCounts,
  believedOptions,
  bluffCandidates,
  setupChecklist,
  setupWarnings,
  targetCounts,
  type Chosen,
} from './rules';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

/** Sets of characters to draw before giving up, and ways to deal each one out. */
const DRAWS = 200;
const DEALS = 30;

const PLURAL: Record<string, string> = {
  townsfolk: 'Townsfolk',
  outsider: 'Outsiders',
  minion: 'Minions',
  demon: 'Demons',
};

/** Why this script cannot support this many players, from the script and the number alone. Empty when it may. */
export function scriptFit(s: GameState): string[] {
  const r = new Reader(s, SETUP_MOMENT);
  const n = r.seated.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return [`Autoplay needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`];
  const counts = baseCounts(s, n);
  const short = PLAYER_TYPES.flatMap((type, i) => {
    const have = r.scriptOfType(type).length;
    const needed = counts[i] as number;
    return have < needed ? [`Not enough ${PLURAL[type]}: ${have} on the script, ${needed} needed.`] : [];
  });
  const good = r.scriptOfType('townsfolk').length + r.scriptOfType('outsider').length;
  const bluffs = counts[0] + counts[1] + 3;
  const told = r.scriptOfType('demon').some((x) => !roleDef(x).flags.noBluffs);
  if (!short.length && told && good < bluffs) {
    short.push(`Not enough good characters for 3 bluffs: ${good} on the script, ${bluffs} needed.`);
  }
  return short;
}

/** What each role's own setup choice comes out as, drawn once each the first time it is asked. */
function choices(rng: Rng): Chosen {
  const drawn = new Map<RoleId, string>();
  return (role, field) => {
    const choice = roleDef(role).setupRules?.choice;
    if (choice?.field !== field) return null;
    if (!drawn.has(role)) drawn.set(role, rng.pick(choice.options));
    return drawn.get(role) ?? null;
  };
}

/** A set of characters that fits the counts it makes itself, or null when this draw came to nothing. */
function drawCharacters(s: GameState, rng: Rng, chosen: Chosen): RoleId[] | null {
  const r = new Reader(s, SETUP_MOMENT);
  const n = r.seated.length;
  const pool = (t: CharacterType) => rng.shuffle(r.scriptOfType(t));
  const base = baseCounts(s, n);
  const evil = [...pool('demon').slice(0, base[3]), ...pool('minion').slice(0, base[2])];
  const counts = (roles: readonly RoleId[]) => targetCounts(s, n, roles, chosen).counts;

  // The Townsfolk can change how many Townsfolk there are. Whoever does stays, and others make the room.
  const townPool = pool('townsfolk');
  const before = counts(evil);
  let towns = townPool.slice(0, before[0]);
  const after = counts([...evil, ...towns]);
  if (after[0] < towns.length) {
    const modifiers = towns.filter((x) => roleDef(x).setupRules?.counts);
    const rest = towns.filter((x) => !modifiers.includes(x));
    towns = [...modifiers, ...rest].slice(0, after[0]);
  } else towns = townPool.slice(0, after[0]);

  const outsiders = pool('outsider').slice(0, after[1]);
  const all = [...evil, ...towns, ...outsiders];
  for (const role of all.slice()) {
    for (const needed of roleDef(role).setupRules?.requires ?? []) {
      if (all.includes(needed) || !r.onScript(needed)) continue;
      const sameType = all.filter((x) => roleDef(x).type === roleDef(needed).type);
      if (sameType.length) all[all.indexOf(rng.pick(sameType))] = needed;
    }
  }
  if (all.length !== n || new Set(all).size !== n) return null;
  const wanted = counts(all);
  const fits = PLAYER_TYPES.every((t, i) => all.filter((x) => roleDef(x).type === t).length === wanted[i]);
  const rules = all.map((x) => roleDef(x).setupRules);
  if (!fits || rules.some((x) => x?.requires?.some((q) => !all.includes(q)))) return null;
  return rules.some((x) => x?.excludes?.some((e) => all.includes(e))) ? null : all;
}

/**
 * Who gets which. A deal with a player on the type they asked for is twice as likely as the same deal without, so for
 * each character, whoever asked for its type is twice as likely to get it. Reached by many random swaps.
 */
function dealOut(s: GameState, roles: readonly RoleId[], rng: Rng): [PlayerId, RoleId][] {
  const ids = new Reader(s, SETUP_MOMENT).seated;
  const dealt = rng.shuffle(roles);
  const weight = (i: number, role: RoleId) =>
    s.players.get(ids[i] as PlayerId)?.rolePreference === roleDef(role).type ? 2 : 1;
  for (let k = 0; k < 40 * ids.length; k++) {
    const i = rng.int(ids.length);
    const j = rng.int(ids.length);
    const [x, y] = [dealt[i] as RoleId, dealt[j] as RoleId];
    if (rng.next() * weight(i, x) * weight(j, y) >= weight(i, y) * weight(j, x)) continue;
    dealt[i] = y;
    dealt[j] = x;
  }
  return ids.map((id, i) => [id, dealt[i] as RoleId]);
}

/** One whole setup from a set of characters, on its own copy of the game. Null when it breaks a rule. */
function setUp(from: GameState, roles: readonly RoleId[], chosen: Chosen, rng: Rng): GameState | null {
  const s = clone(from);
  const run = new Run({ world: s, moment: SETUP_MOMENT, seed: 0, now: 0 });
  const r = run.reader;
  for (const [id, role] of dealOut(s, roles, rng)) {
    run.changeCharacter(id, role, { reason: 'setup', alignment: 'natural', keepGranted: false });
  }
  for (const id of r.seated) {
    const role = r.character(id);
    if (!role || !roleDef(role).believes) continue;
    const options = believedOptions(s, id);
    if (!options.length) return null;
    run.setBelieved(id, rng.pick(options));
  }
  for (const a of r.instances) {
    for (const f of roleDef(a.roleId).setupFields ?? []) {
      if (f.when && !f.when(r)) continue;
      const own = r.isBelieved(a) ? null : chosen(a.roleId, f.field);
      const options = f.options(r).map((o) => o.id);
      const value =
        f.kind === 'text'
          ? (f.suggest?.(r, rng.pick) ?? null)
          : own !== null && options.includes(own)
            ? own
            : options.length
              ? rng.pick(options)
              : null;
      if (value === null || f.validate?.(r, value)) return null;
      a.state = {
        ...(a.state as object),
        setup: { ...new HookCtx<{ setup?: object }>(r, a).state?.setup, [f.field]: value },
      };
    }
  }
  if (!r.inPlay.some((role) => roleDef(role).flags.noBluffs)) {
    s.setup.bluffs = rng.shuffle(bluffCandidates(s)).slice(0, 3);
  }
  return setupChecklist(s).every((c) => c.done) && !setupWarnings(s).length ? s : null;
}

/** The game with nothing set up: whatever a Storyteller had chosen before autoplay was. */
function blank(s: GameState): GameState {
  const players = [...s.players.values()].map((p) => ({
    ...p,
    character: null,
    alignment: 'good' as const,
    self: { character: null, alignment: 'good' as const },
    history: [],
  }));
  return {
    ...s,
    players: new Map(players.map((p) => [p.id, p])),
    abilities: new Map(),
    conditions: [],
    storytellerCharacters: [],
    setup: { ...s.setup, bag: new Map(), bluffs: [] },
  };
}

/** A whole legal setup, or null when the script seems to have none for this many players. */
export function deal(s: GameState, seed: number): GameState | null {
  const clean = blank(s);
  for (let i = 0; i < DRAWS; i++) {
    const rng = subRng(seed, `deal:${i}`);
    const chosen = choices(rng);
    const roles = drawCharacters(clean, rng, chosen);
    if (!roles) continue;
    for (let j = 0; j < DEALS; j++) {
      const done = setUp(clean, roles, chosen, rng);
      if (done) return done;
    }
  }
  return null;
}
