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
  it('a recorded choice can be cleared, and then Review asks again', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn();
    s.act('moonchild', 'target', ['bo']);
    s.act('moonchild', 'target', []);
    expect(fact(s)).toMatchObject({ recorded: null, clearable: true, default: null });
    s.dusk().review();
    expect(s.hasDecision('moonchild_target')).toBe(true);
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
  it('shows the recorded choice, needed tonight', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn();
    expect(fact(s)).toMatchObject({ recorded: null, neededTonight: true });
    s.act('moonchild', 'target', ['bo']);
    expect(fact(s)?.recorded).toEqual(['bo']);
  });
  it('killed at night with nothing recorded the next day: the following night Review asks who they chose', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
    s.dusk().review();
    expect(s.decision('moonchild_target')).toMatchObject({ required: true, chosen: null });
    s.decide('moonchild_target', 'bo').dawn();
    expect(s.alive('bo')).toBe(false);
    // Spent: the next night asks nothing.
    s.dusk().review();
    expect(s.hasDecision('moonchild_target')).toBe(false);
  });
  it('a day death in front of everyone is learned at once: chosen that day, and the target dies that night', () => {
    const s = scene(cast).start().dawn().kill('ann');
    s.act('moonchild', 'target', ['bo']);
    s.dusk().dawn();
    expect(s.alive('bo')).toBe(false);
  });
  it("forced past the question, they didn't choose and the ability is spent", () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn().dusk().review();
    expect(s.decision('moonchild_target')).toMatchObject({ required: true, chosen: null });
    s.dawn();
    expect(s.alive('bo')).toBe(true);
    s.dusk().review();
    expect(s.hasDecision('moonchild_target')).toBe(false);
  });
  it('offers the choice only once they are dead', () => {
    const s = scene(cast).start().dawn();
    expect(s.dayActions()).toEqual([]);
  });
});
