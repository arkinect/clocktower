import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'golem', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Golem', () => {
  it('kills a non-Demon nominee; nothing happens to the Demon, and the use is spent', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('golem', 'nominated', ['bo']).effective).toBe(true);
    expect(s.alive('bo')).toBe(false);
    const t = scene(cast).start().dawn();
    expect(t.act('golem', 'nominated', ['cy']).effective).toBe(false);
    expect(t.alive('cy')).toBe(true);
    expect(t.state.abilities.get(t.ability('golem'))?.used).toBe(true);
  });
});
