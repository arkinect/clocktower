import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'psychopath', bo: 't1', cy: 'imp', di: 't2', ed: 't3', fi: 't4' };
const psycho = (s: ReturnType<typeof scene>) => s.dayActions().filter((d) => d.roleId === 'psychopath');

describe('Psychopath', () => {
  it('kills the player they choose, once a day', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('psychopath', 'kill', ['bo']).effective).toBe(true);
    expect(s.alive('bo')).toBe(false);
    // Shown confirmed, the dead player still listed, until the day ends.
    expect(psycho(s)[0]?.recorded).toEqual(['bo']);
    expect(psycho(s)[0]?.fields[0]?.options).toContain('bo');
    s.dusk().dawn();
    expect(psycho(s)).toHaveLength(1);
    expect(psycho(s)[0]?.recorded).toBeNull();
  });
  it('a second Use takes it back: the player lives, and they can choose again', () => {
    const s = scene(cast).start().dawn();
    s.act('psychopath', 'kill', ['bo']);
    s.act('psychopath', 'kill', []);
    expect(s.alive('bo')).toBe(true);
    expect(psycho(s)[0]?.recorded).toBeNull();
    expect(s.act('psychopath', 'kill', ['di']).effective).toBe(true);
  });
  it('an impaired Psychopath kills nobody', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.act('psychopath', 'kill', ['bo']).effective).toBe(false);
    expect(s.alive('bo')).toBe(true);
  });
  it("a Tea Lady's good neighbour survives", () => {
    const s = scene({ ann: 'psychopath', bo: 't1', cy: 'tea_lady', di: 't2', ed: 'imp', fi: 't3' }).start().dawn();
    expect(s.act('psychopath', 'kill', ['di']).effective).toBe(false);
    expect(s.alive('di')).toBe(true);
  });
  it('a preview changes nothing', () => {
    const s = scene(cast).start().dawn();
    s.act('psychopath', 'kill', ['bo'], { mode: 'preview' });
    expect(s.alive('bo')).toBe(true);
    expect(psycho(s)).toHaveLength(1);
  });
  it('the Storyteller can force either way', () => {
    const s = scene(cast).start().dawn();
    s.act('psychopath', 'kill', ['bo'], { mode: 'force_fail' });
    expect(s.alive('bo')).toBe(true);
    const t = scene(cast).start().dawn();
    t.act('psychopath', 'kill', ['cy'], { mode: 'force_success' });
    expect(t.alive('cy')).toBe(false);
  });
  it('not while dead', () => {
    const s = scene(cast).start().dawn().kill('ann');
    expect(psycho(s)).toEqual([]);
  });
});
