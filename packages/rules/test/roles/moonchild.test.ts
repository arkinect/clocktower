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
  it('offers the choice only once they are dead', () => {
    const s = scene(cast).start().dawn();
    expect(s.dayActions()).toEqual([]);
  });
});
