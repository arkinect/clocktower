import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'moonchild', bo: 't1', cy: 'imp', di: 'm1', ed: 't3' };
describe('Moonchild', () => {
  it('kills a good target the night they are chosen', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann');
    s.act('moonchild', 'target', ['bo']);
    s.dusk().dawn();
    expect(s.alive('bo')).toBe(false);
  });
  it('an evil target lives', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann');
    s.act('moonchild', 'target', ['di']);
    s.dusk().dawn();
    expect(s.alive('di')).toBe(true);
  });
  it('impaired when they died means no effect', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['ann'] })
      .dawn();
    s.execute('ann');
    s.act('moonchild', 'target', ['bo']);
    s.dusk().dawn();
    expect(s.alive('bo')).toBe(true);
  });
  it('shows the recorded choice, needed tonight', () => {
    const s = scene(cast).start().dawn().execute('ann');
    const fact = () => s.dayActions().find((d) => d.roleId === 'moonchild');
    expect(fact()).toMatchObject({ recorded: null, neededTonight: true });
    s.act('moonchild', 'target', ['bo']);
    expect(fact()?.recorded).toEqual(['bo']);
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
  it("forced past the question, they didn't choose and the ability is spent", () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().dawn();
    expect(s.alive('bo')).toBe(true);
    s.dusk().review();
    expect(s.hasDecision('moonchild_target')).toBe(false);
  });
  it('offers the choice only once they are dead', () => {
    const s = scene(cast).start().dawn();
    expect(s.dayActions()).toEqual([]);
  });
});
