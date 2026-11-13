import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'slayer', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Slayer', () => {
  it('kills the Demon', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('slayer', 'shoot', ['cy']).effective).toBe(true);
    expect(s.alive('cy')).toBe(false);
  });
  it('misses anyone else and spends the shot', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('slayer', 'shoot', ['bo']).effective).toBe(false);
    expect(s.dayActions()[0]?.recorded).toEqual(['bo']);
    s.dusk().dawn();
    expect(s.dayActions()).toEqual([]);
  });
  it('a second Use takes it back: the Demon lives and the shot is not spent', () => {
    const s = scene(cast).start().dawn();
    s.act('slayer', 'shoot', ['cy']);
    expect(s.alive('cy')).toBe(false);
    s.act('slayer', 'shoot', []);
    expect(s.alive('cy')).toBe(true);
    expect(s.dayActions()[0]?.recorded).toBeNull();
    expect(s.state.abilities[s.ability('slayer')]?.used).toBe(false);
  });
  it('a preview changes nothing', () => {
    const s = scene(cast).start().dawn();
    s.act('slayer', 'shoot', ['cy'], { mode: 'preview' });
    expect(s.alive('cy')).toBe(true);
    expect(s.dayActions()).toHaveLength(1);
  });
  it('the Storyteller can force a miss to land', () => {
    const s = scene(cast).start().dawn();
    s.act('slayer', 'shoot', ['bo'], { mode: 'force_success' });
    expect(s.alive('bo')).toBe(false);
  });
});
