import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'golem', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
const golem = (s: ReturnType<typeof scene>) => s.dayActions().filter((d) => d.roleId === 'golem');

describe('Golem', () => {
  it('kills a non-Demon nominee, once', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('golem', 'nominated', ['bo']).effective).toBe(true);
    expect(s.alive('bo')).toBe(false);
    expect(golem(s)).toEqual([]);
  });
  it('nothing happens to the Demon, and the use is spent', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('golem', 'nominated', ['cy']).effective).toBe(false);
    expect(s.alive('cy')).toBe(true);
    expect(golem(s)).toEqual([]);
  });
  it('an impaired Golem spends the use for nothing', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.act('golem', 'nominated', ['bo']).effective).toBe(false);
    expect(s.alive('bo')).toBe(true);
    expect(golem(s)).toEqual([]);
  });
  it('a preview changes nothing', () => {
    const s = scene(cast).start().dawn();
    s.act('golem', 'nominated', ['bo'], { mode: 'preview' });
    expect(s.alive('bo')).toBe(true);
    expect(golem(s)).toHaveLength(1);
  });
  it('the Storyteller can force either way', () => {
    const s = scene(cast).start().dawn();
    s.act('golem', 'nominated', ['cy'], { mode: 'force_success' });
    expect(s.alive('cy')).toBe(false);
    const t = scene(cast).start().dawn();
    t.act('golem', 'nominated', ['bo'], { mode: 'force_fail' });
    expect(t.alive('bo')).toBe(true);
  });
  it('is not offered once the Golem is dead', () => {
    const s = scene(cast).start().dawn().kill('ann');
    expect(golem(s)).toEqual([]);
  });
});
