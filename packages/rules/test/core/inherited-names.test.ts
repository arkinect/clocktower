// The names every plain object inherits are never ids: no command may find something, or write something, under one.
import { afterEach, describe, expect, it } from 'vitest';
import { AbilityId, Actions, Command, ConditionId, PlayerId, RoleId, type Command as CommandT } from '@ct/protocol';
import { dispatch, findRole, playerView, storytellerView, type GameStateT } from '../../src';
import { begin, cast, dawn, pid, ST, toReview, type TestGame } from '../helpers/game';
import { DEMON, MINION, TOWN } from '../helpers/plain';

const NAMES = Object.getOwnPropertyNames(Object.prototype);
const inputs = { now: 900_000, seed: 3 };

function clean() {
  for (const k of Object.getOwnPropertyNames(Object.prototype)) {
    if (!NAMES.includes(k)) Reflect.deleteProperty(Object.prototype, k);
  }
}
afterEach(clean);

interface Def {
  type: string;
  shape: Record<string, Schema>;
  values: unknown[];
  element: Schema;
  innerType: Schema;
  entries: Record<string, unknown>;
  options: Schema[];
  in: Schema;
  getter(): Schema;
}
interface Schema {
  _zod: { def: Def };
}

/** A command of this shape, with `bad` in every string that is not a name or free text. */
function fill(schema: Schema, bad: string, key = ''): unknown {
  const d = schema._zod.def;
  switch (d.type) {
    case 'object':
      return Object.fromEntries(Object.entries(d.shape).map(([k, v]) => [k, fill(v, bad, k)]));
    case 'literal':
      return d.values[0];
    case 'string':
      return key === 'name' || key === 'text' ? 'Zed' : bad;
    case 'array':
      return Array.from({ length: key === 'counts' ? 4 : 1 }, () => fill(d.element, bad, key));
    case 'nullable':
    case 'optional':
      return fill(d.innerType, bad, key);
    case 'number':
    case 'int':
      return 10;
    case 'boolean':
      return false;
    case 'enum':
      return Object.values(d.entries)[0];
    case 'record':
      // Parsed, so that `__proto__` is an own key.
      return JSON.parse(`{"${bad}":"imp"}`);
    case 'union':
      return fill(d.options[0] as Schema, bad, key);
    case 'pipe':
      return fill(d.in, bad, key);
    case 'lazy':
      return fill(d.getter(), bad, key);
    default:
      throw new Error(`The sweep cannot fill a ${d.type}`);
  }
}

const game = () => cast({ Ann: TOWN[0]!, Bo: TOWN[1]!, Cy: TOWN[2]!, Di: MINION[0]!, Ed: DEMON[0]! });
const PHASES: Record<string, () => TestGame> = {
  setup: game,
  collecting: () => begin(game()),
  review: () => toReview(begin(game())),
  day: () => dawn(begin(game())),
};

function checkViews(s: GameStateT) {
  for (const id of [...s.players.keys()]) playerView(s, id as PlayerId, inputs.now);
  storytellerView(s, s.storytellerId ?? ST, { now: inputs.now });
}

describe('inherited names', () => {
  for (const [phase, make] of Object.entries(PHASES)) {
    it(`no command takes one as an id in ${phase}`, () => {
      const { state } = make();
      for (const schema of Command.options) {
        for (const bad of NAMES) {
          const command = fill(schema as unknown as Schema, bad);
          const label = `${schema.shape.type.value} ${bad}`;
          const actor = schema.shape.type.value === 'join' ? null : ST;
          const res = dispatch(state, actor, command, inputs);
          const polluted = Object.getOwnPropertyNames(Object.prototype);
          clean();
          expect(polluted, label).toEqual(NAMES);
          if (res.ok) expect(() => checkViews(res.state), label).not.toThrow();
          else expect(res.internal, label).toBeUndefined();
        }
      }
    });
  }

  it.each(NAMES)('%s is refused as an id on arrival', (bad) => {
    const commands = [
      { type: 'set_seating', order: [bad] },
      { type: 'rename_player', playerId: bad, name: 'Zed' },
      { type: 'set_ability_used', abilityId: bad, used: true },
      { type: 'add_traveller', playerId: bad, roleId: 'imp', alignment: 'good' },
      { type: 'set_setup_field', abilityId: bad, field: 'x', value: null },
      { type: 'suggest_setup_field', abilityId: bad, field: 'x' },
      { type: 'day_action', abilityId: bad, action: 'x', values: [], mode: 'accept' },
      { type: 'remove_condition', conditionId: bad },
    ];
    for (const c of commands) expect(Command.safeParse(c).success, c.type).toBe(false);
    expect(PlayerId.safeParse(bad).success).toBe(false);
  });

  it.each(NAMES)('%s is never kept as the key of a table sent by a client', (bad) => {
    const raw: unknown = JSON.parse(`{"${bad}":{"values":[]}}`);
    const actions = Actions.safeParse(raw);
    expect(actions.success && Object.hasOwn(actions.data, bad)).toBe(false);
    const many = Command.safeParse(JSON.parse(`{"type":"assign_many","assignments":{"${bad}":"imp"}}`));
    expect(
      many.success && Object.hasOwn((many.data as Extract<CommandT, { type: 'assign_many' }>).assignments, bad),
    ).toBe(false);
  });

  it.each(NAMES)('%s is not an actor', (bad) => {
    const res = dispatch(game().state, bad as PlayerId, { type: 'seen_role' }, inputs);
    expect(res).toMatchObject({ ok: false, error: 'Unknown player.' });
    expect(findRole(bad)).toBeUndefined();
  });

  it('a name that only resembles one is an ordinary id', () => {
    expect(RoleId.safeParse('Constructor').success).toBe(true);
  });

  it('an id has the exact format it is minted in', () => {
    for (const [schema, good, bad] of [
      [
        PlayerId,
        [pid('Ann'), '0123456789abcdef'],
        ['', 'ann', pid('Ann').toUpperCase(), `${pid('Ann')}0`, `${pid('Ann')}\n`],
      ],
      [AbilityId, ['a1', 'a123456789'], ['a', 'c1', 'a1234567890', 'a1\n', 'x-a1']],
      [ConditionId, ['c1'], ['c', 'a1', 'c1 ']],
    ] as const) {
      for (const id of good) expect(schema.safeParse(id).success, id).toBe(true);
      for (const id of bad) expect(schema.safeParse(id).success, id).toBe(false);
    }
  });
});
