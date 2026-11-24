// The state's tables are Maps, which plain JSON would silently write as {}. These hold saving and copying to all of it.
import { describe, expect, it } from 'vitest';
import { original, produce } from 'immer';
import { loadState, saveState, type GameStateT } from '../../src';
import { clone } from '../../src/util/clone';
import { pid } from '../helpers/game';
import { scene } from '../scenario';

/** Mid-night, with something in every table. */
function midNight(): GameStateT {
  const s = scene(
    { ann: 'empath', bo: 'drunk', cy: 'imp', di: 'poisoner', ed: 'ravenkeeper' },
    { believed: { bo: 'oracle' } },
  )
    .start()
    .nextNight()
    .submit({ cy: ['ed'], di: ['ann'] })
    .review();
  s.answer('ed', ['ann']);
  s.g.st({ type: 'accept_all_defaults' });
  s.g.st({ type: 'decide', key: { kind: 'unasked' }, option: 'x' });
  s.g.st({ type: 'override_result', resultKey: s.row('ann').key, lines: ['2'] });
  return s.state;
}

const maps = (v: unknown): Map<unknown, unknown>[] => {
  if (typeof v !== 'object' || v === null) return [];
  const inside = v instanceof Map ? [...v.values()] : Object.values(v);
  return [...(v instanceof Map ? [v] : []), ...inside.flatMap(maps)];
};

describe('saving', () => {
  const state = midNight();

  it('writes every table, and reads back the same state', () => {
    expect(maps(state)).toHaveLength(8);
    for (const m of maps(state)) expect(m.size).toBeGreaterThan(0);
    const saved = saveState(state);
    const json = JSON.parse(saved) as Record<string, Record<string, unknown>>;
    expect(Object.keys(json['players']!)).toEqual([...state.players.keys()]);
    expect(Object.keys(json['abilities']!)).toEqual([...state.abilities.keys()]);
    expect(Object.keys(json['inbox']!)).toEqual([...state.inbox.keys()]);
    const back = loadState(saved).state;
    expect(back).toEqual(state);
    expect(saveState(back!)).toBe(saved);
  });

  it('freezes what is inside a table, so nothing changes a state that is already kept', () => {
    expect(() => state.players.set(pid('zed'), state.players.get(pid('ann'))!)).toThrow();
    expect(Object.isFrozen(state.players.get(pid('ann')))).toBe(true);
    expect(Object.isFrozen(state.players.get(pid('ann'))!.life)).toBe(true);
  });

  it('a copy is complete, separate, and can be taken of a draft', () => {
    const copy = clone(state);
    expect(copy).toEqual(state);
    copy.players.get(pid('ann'))!.name = 'Changed';
    copy.inbox.clear();
    expect(state.players.get(pid('ann'))!.name).toBe('ann');
    expect(state.inbox.size).toBeGreaterThan(0);
    produce(state, (d) => {
      d.players.get(pid('ann'))!.name = 'Drafted';
      const taken = clone(d) as GameStateT;
      expect(original(d)!.players.get(pid('ann'))!.name).toBe('ann');
      expect(taken.players.get(pid('ann'))!.name).toBe('Drafted');
      expect(structuredClone(taken)).toEqual(taken);
    });
    expect(clone({ a: undefined, b: 1 })).toStrictEqual({ b: 1 });
  });
});
