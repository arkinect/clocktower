// Setup rules as data: type counts, modifiers, the distribution suggestion, bluffs and the checklist.
import type { CheckItem, CharacterType, PlayerId, RoleId } from '@ct/protocol';
import type { Counts, SetupQuery } from '../abilities/define';
import { allJinxes, findRole, PLAYER_TYPES, roleDef } from '../abilities/registry';
import { Reader } from '../derive/reader';
import type { GameState } from '../model/state';
import { SETUP_MOMENT } from '../model/state';
import { HookCtx } from '../night/context';
import type { Rng } from '../util/rng';

/** Default chart, index = player count: townsfolk, outsiders, minions, demons. */
export const TYPE_CHART: Record<number, Counts> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

const reader = (s: GameState) => new Reader(s, SETUP_MOMENT);

function clampChart(n: number): Counts {
  const k = Math.max(5, Math.min(15, n));
  const base = [...(TYPE_CHART[k] as Counts)] as Counts;
  if (n !== k) base[0] += n - k; // outside 5 to 15: Townsfolk absorb the difference
  return base;
}

function query(s: GameState, playerCount: number, roles: readonly RoleId[]): SetupQuery {
  return {
    roles,
    playerCount,
    field(role, field) {
      const a = Object.values(s.abilities).find(
        (x) => x.roleId === role && x.activeUntil !== 'removed' && x.origin.kind === 'character',
      );
      const state = a?.state as { setup?: Record<string, string | null> } | undefined;
      return state?.setup?.[field] ?? null;
    },
  };
}

/** The chart plus each role's count rules. Late rules see the result of the others. */
export function modifiedCounts(s: GameState, playerCount: number, roles: readonly RoleId[], late: boolean): Counts {
  const c = clampChart(playerCount);
  const q = query(s, playerCount, roles);
  const rules = roles.flatMap((r) => findRole(r)?.setupRules ?? []);
  for (const rule of rules) if (!rule.late) rule.counts?.(c, q);
  if (late) for (const rule of rules) if (rule.late) rule.counts?.(c, q);
  return c;
}

export function targetCounts(s: GameState, playerCount: number, roles: readonly RoleId[]) {
  const override = s.setup.rules.countsOverride;
  if (override) return { counts: [...override] as Counts, source: 'override' as const };
  const c = modifiedCounts(s, playerCount, roles, true);
  return { counts: c.map((x) => Math.max(0, x)) as Counts, source: 'default' as const };
}

export function actualCounts(s: GameState): Counts {
  const r = reader(s);
  const c: Counts = [0, 0, 0, 0];
  for (const id of r.seated) {
    const i = PLAYER_TYPES.indexOf(r.typeOf(id) as CharacterType);
    if (i >= 0) c[i as 0 | 1 | 2 | 3]++;
  }
  return c;
}

/** Random assignment that respects target counts and modifiers. */
export function suggestDistribution(s: GameState, rng: Rng): Record<string, RoleId> | { error: string } {
  const r = reader(s);
  const ids = r.seated;
  const n = ids.length;
  if (n === 0) return { error: 'Seat players first.' };
  const pool = (t: CharacterType) => r.scriptOfType(t);
  if (!pool('demon').length) return { error: 'No Demon is enabled.' };
  for (let attempt = 0; attempt < 50; attempt++) {
    let demons = rng.shuffle(pool('demon')).slice(0, Math.max(1, targetCounts(s, n, []).counts[3]));
    let { counts } = targetCounts(s, n, demons);
    demons = demons.slice(0, Math.max(0, counts[3]));
    const minions = rng.shuffle(pool('minion')).slice(0, counts[2]);
    const picked = [...demons, ...minions];
    ({ counts } = targetCounts(s, n, picked));
    const townPool = rng.shuffle(pool('townsfolk'));
    let towns = townPool.slice(0, counts[0]);
    ({ counts } = targetCounts(s, n, [...picked, ...towns]));
    towns = townPool.slice(0, counts[0]);
    const outsiders = rng.shuffle(pool('outsider')).slice(0, counts[1]);
    const all = [...picked, ...towns, ...outsiders];
    let stuck = false;
    for (const role of [...all]) {
      for (const needed of roleDef(role).setupRules?.requires ?? []) {
        if (all.includes(needed)) continue;
        const slot = all.findIndex((x) => roleDef(x).type === roleDef(needed).type);
        if (slot >= 0 && r.onScript(needed)) {
          all[slot] = needed;
        } else {
          const spare = townPool.find((x) => !all.includes(x));
          if (!spare) stuck = true;
          else all[all.indexOf(role)] = spare;
        }
      }
    }
    if (stuck || all.length !== n || minions.length < counts[2]) continue;
    if (all.some((x) => roleDef(x).setupRules?.excludes?.some((e) => all.includes(e)))) continue;
    const shuffled = rng.shuffle(all);
    return Object.fromEntries(ids.map((id, i) => [id, shuffled[i] as RoleId]));
  }
  return { error: 'Not enough enabled roles of each type for this player count.' };
}

/** Good roles that are not in play and not anyone's believed role. */
export function bluffCandidates(s: GameState): RoleId[] {
  const r = reader(s);
  const taken = new Set([...r.inPlay, ...r.believedInPlay]);
  return r.script.filter((x) => {
    const def = roleDef(x);
    return def.alignment === 'good' && PLAYER_TYPES.includes(def.type) && !taken.has(x);
  });
}

export function suggestBluffs(s: GameState, rng: Rng): RoleId[] {
  const c = bluffCandidates(s);
  const towns = rng.shuffle(c.filter((x) => roleDef(x).type === 'townsfolk'));
  const outs = rng.shuffle(c.filter((x) => roleDef(x).type === 'outsider'));
  return [...towns, ...outs].slice(0, 3);
}

export function believedOptions(s: GameState, player: PlayerId): RoleId[] {
  const r = reader(s);
  const c = r.character(player);
  const rule = c ? roleDef(c).believes : undefined;
  if (!rule) return [];
  const others = r.seated.filter((id) => id !== player).map((id) => s.setup.bag[id]);
  return r.script.filter((x) => rule.allowed(roleDef(x)) && !r.inPlay.includes(x) && !others.includes(x));
}

export function setupChecklist(s: GameState): CheckItem[] {
  const r = reader(s);
  const ids = r.seated;
  const unassigned = ids.filter((id) => !r.character(id));
  const unseated = Object.values(s.players).filter((p) => p.id !== s.storytellerId && !ids.includes(p.id));
  const items: CheckItem[] = [
    {
      id: 'seated',
      label: unseated.length ? `Seat everyone (${unseated.length} unseated)` : 'Everyone is seated',
      done: unseated.length === 0 && ids.length > 0,
      blocking: true,
    },
    {
      id: 'roles',
      label: unassigned.length
        ? `Assign a character to every seated player (${unassigned.length} left)`
        : 'Every seated player has a character',
      done: ids.length > 0 && unassigned.length === 0,
      blocking: true,
    },
    {
      id: 'demon',
      label:
        r.demons.length === 1 || unassigned.length
          ? 'Exactly one Demon is assigned'
          : `Exactly one Demon is assigned (${r.demons.length} assigned)`,
      done: r.demons.length === 1,
      blocking: false,
    },
  ];
  const inPlay = r.inPlay;
  for (const id of ids) {
    const c = r.character(id);
    const rule = c ? roleDef(c).believes : undefined;
    if (!rule) continue;
    const b = s.setup.bag[id];
    items.push({
      id: `believes:${id}`,
      label: `Choose ${rule.label} (${r.name(id)})`,
      done: !!b && rule.allowed(roleDef(b)) && !inPlay.includes(b),
      blocking: true,
    });
  }
  for (const a of r.instances) {
    const hook = roleDef(a.roleId).ability.checklist;
    if (hook) items.push(...hook(new HookCtx(r, a)));
  }
  for (const role of new Set(inPlay)) {
    for (const needed of roleDef(role).setupRules?.requires ?? []) {
      items.push({
        id: `requires:${role}:${needed}`,
        label: `${roleDef(role).name} needs the ${roleDef(needed).name} in play`,
        done: inPlay.includes(needed),
        blocking: true,
      });
    }
  }
  for (const j of allJinxes()) if (j.hooks?.checklist) items.push(...j.hooks.checklist(r));
  const cands = bluffCandidates(s);
  const bluffs = s.setup.bluffs;
  items.push({
    id: 'bluffs',
    label: 'Choose 3 Demon bluffs (good roles not in play)',
    done: bluffs.length === 3 && new Set(bluffs).size === 3 && bluffs.every((b) => cands.includes(b)),
    blocking: true,
  });
  return items;
}

const roleTypeName = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function setupWarnings(s: GameState): string[] {
  const r = reader(s);
  const out: string[] = [];
  const ids = r.seated;
  const n = ids.length;
  if (n && (n < 5 || n > 15)) out.push(`${n} players seated: the normal range is 5 to 15.`);
  if (!r.scriptOfType('demon').length) out.push('No Demon is enabled. The game cannot start.');
  const assigned = n > 0 && ids.every((id) => r.character(id));
  const { counts } = targetCounts(s, n, r.inPlay);
  const actual = actualCounts(s);
  PLAYER_TYPES.forEach((t, i) => {
    const have = r.scriptOfType(t).length;
    if (have < (counts[i] as number)) out.push(`Only ${have} ${t} roles enabled but ${counts[i]} needed.`);
  });
  if (assigned && actual.some((v, i) => v !== counts[i])) {
    out.push(`Assigned types (${actual.join('/')}) differ from target (${counts.join('/')}).`);
  }
  const demons = r.demons;
  for (const id of ids) {
    const c = r.character(id);
    const type = c ? roleDef(c).setupRules?.neighbours : undefined;
    if (!type) continue;
    const others = type === 'demon' ? demons : ids.filter((x) => x !== id && r.typeOf(x) === type);
    if (others.length && !others.some((d) => r.areNeighbours(d, id))) {
      const who = type === 'demon' ? 'the Demon' : `a ${roleTypeName(type)}`;
      out.push(`${r.roleName(c)} (${r.name(id)}) does not sit next to ${who}.`);
    }
  }
  for (const a of r.instances) {
    const hook = roleDef(a.roleId).ability.warnings;
    if (hook) out.push(...hook(new HookCtx(r, a)));
  }
  for (const j of allJinxes()) if (j.hooks?.warnings) out.push(...j.hooks.warnings(r));
  // The Demon count and unseated players are checklist items, so they are not repeated here.
  return out;
}
