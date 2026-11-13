import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'moonchild', bo: 't1', cy: 'imp', di: 'm1', ed: 't3' };
const fact = (s: ReturnType<typeof scene>) => s.dayActions().find((d) => d.roleId === 'moonchild');

describe('Moonchild', () => {
  it('executed: learns it the next morning, chooses then, and a good target dies that night', () => {
    const s = scene(cast).start().dawn().execute('ann');
    expect(fact(s)).toBeUndefined();
    s.dusk().review();
    expect(s.hasDecision('moonchild_target')).toBe(false);
    s.dawn();
    expect(s.alive('ann')).toBe(false);
    s.act('moonchild', 'target', ['bo']);
    s.dusk().dawn();
    expect(s.alive('bo')).toBe(false);
  });
  it('"no one" is the default: left alone, dusk records it, the ability is spent and nothing wakes', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn();
    expect(fact(s)).toMatchObject({ recorded: null, default: ['none'] });
    expect(fact(s)?.blocksNight).toBeFalsy();
    expect(fact(s)?.fields[0]?.options[0]).toBe('none');
    s.dusk().review();
    expect(s.hasDecision('moonchild_target')).toBe(false);
    expect(s.state.abilities[s.ability('moonchild')]?.used).toBe(true);
    s.dawn();
    expect(s.alive('bo')).toBe(true);
    expect(fact(s)).toBeUndefined();
  });
  it('"no one" chosen spends the ability at once, and can still be changed that day', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn();
    s.act('moonchild', 'target', ['none']);
    expect(fact(s)?.recorded).toEqual(['none']);
    expect(s.state.abilities[s.ability('moonchild')]?.used).toBe(true);
    s.act('moonchild', 'target', ['bo']);
    expect(s.state.abilities[s.ability('moonchild')]?.used).toBe(false);
  });
  it('an evil target lives', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn();
    s.act('moonchild', 'target', ['di']);
    s.dusk().dawn();
    expect(s.alive('di')).toBe(true);
  });
  it('impaired when they died means no effect', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['ann'] })
      .dawn()
      .execute('ann')
      .dusk()
      .dawn();
    s.act('moonchild', 'target', ['bo']);
    s.dusk().dawn();
    expect(s.alive('bo')).toBe(true);
  });
  it('saved from the execution by the Tea Lady: never dead, so nothing to choose', () => {
    const s = scene({ ann: 'moonchild', bo: 'tea_lady', cy: 't1', di: 'imp', ed: 'm1' })
      .start()
      .dawn()
      .execute('ann')
      .dusk()
      .dawn();
    expect(s.alive('ann')).toBe(true);
    expect(fact(s)).toBeUndefined();
  });
  it('shows the recorded choice', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn();
    expect(fact(s)?.recorded).toBeNull();
    s.act('moonchild', 'target', ['bo']);
    expect(fact(s)?.recorded).toEqual(['bo']);
  });
  it('killed at night: chosen the next day, and Review never asks', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
    s.act('moonchild', 'target', ['bo']);
    s.dusk().review();
    expect(s.hasDecision('moonchild_target')).toBe(false);
    s.dawn();
    expect(s.alive('bo')).toBe(false);
    // Spent: nothing to choose the next day.
    expect(fact(s)).toBeUndefined();
  });
  it('a day death in front of everyone is learned at once: chosen that day, and the target dies that night', () => {
    const s = scene(cast).start().dawn().kill('ann');
    s.act('moonchild', 'target', ['bo']);
    s.dusk().dawn();
    expect(s.alive('bo')).toBe(false);
  });
  it('offers the choice only once they are dead', () => {
    const s = scene(cast).start().dawn();
    expect(s.dayActions()).toEqual([]);
  });
});
