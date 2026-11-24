import { describe, expect, it } from 'vitest';
import { scene, ST } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'inquisitor', bo: 't1', cy: 'imp', di: 'm1', ed: 't3' };
const inquisitor = (s: ReturnType<typeof scene>) => s.dayActions().filter((d) => d.roleId === 'inquisitor');

describe('Inquisitor', () => {
  it('kills a good nominee, once', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('inquisitor', 'nominated', ['bo']).effective).toBe(true);
    expect(s.alive('bo')).toBe(false);
    // Shown confirmed for the rest of the day, then gone.
    expect(inquisitor(s)[0]?.recorded).toEqual([pid('bo')]);
    s.dusk().dawn();
    expect(inquisitor(s)).toEqual([]);
  });
  it('a second Use takes it back: the nominee lives and the use is not spent', () => {
    const s = scene(cast).start().dawn();
    s.act('inquisitor', 'nominated', ['bo']);
    const again = { type: 'day_action' as const, abilityId: s.ability('inquisitor'), action: 'nominated' };
    expect(s.g.tryAs(ST, { ...again, values: [pid('ed') as never], mode: 'accept' }).ok).toBe(false);
    s.act('inquisitor', 'nominated', []);
    expect(s.alive('bo')).toBe(true);
    expect(inquisitor(s)[0]?.recorded).toBeNull();
    expect(s.state.abilities.get(s.ability('inquisitor'))?.used).toBe(false);
  });
  it.each(['cy', 'di'])('nothing happens to an evil nominee (%s), and the use is spent', (nominee) => {
    const s = scene(cast).start().dawn();
    expect(s.act('inquisitor', 'nominated', [nominee]).effective).toBe(false);
    expect(s.alive(nominee)).toBe(true);
    expect(s.state.abilities.get(s.ability('inquisitor'))?.used).toBe(true);
  });
  it('an impaired Inquisitor spends the use for nothing', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.act('inquisitor', 'nominated', ['bo']).effective).toBe(false);
    expect(s.alive('bo')).toBe(true);
    expect(s.state.abilities.get(s.ability('inquisitor'))?.used).toBe(true);
  });
  it('a preview changes nothing', () => {
    const s = scene(cast).start().dawn();
    s.act('inquisitor', 'nominated', ['bo'], { mode: 'preview' });
    expect(s.alive('bo')).toBe(true);
    expect(inquisitor(s)).toHaveLength(1);
  });
  it('the Storyteller can force either way', () => {
    const s = scene(cast).start().dawn();
    s.act('inquisitor', 'nominated', ['cy'], { mode: 'force_success' });
    expect(s.alive('cy')).toBe(false);
    const t = scene(cast).start().dawn();
    t.act('inquisitor', 'nominated', ['bo'], { mode: 'force_fail' });
    expect(t.alive('bo')).toBe(true);
  });
  it('is not offered once the Inquisitor is dead', () => {
    const s = scene(cast).start().dawn().kill('ann');
    expect(inquisitor(s)).toEqual([]);
  });
});
