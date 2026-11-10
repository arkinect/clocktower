import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'philosopher', bo: 'empath', cy: 'imp', di: 't2', ed: 'm1' };
describe('Philosopher', () => {
  it('gains the ability and drunks the real holder while sober', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['empath'] });
    expect(s.truth('ann')).toContain('You chose the Empath ability.');
    expect(s.row('bo').impaired).toBe(true);
    s.dawn();
    expect(s.impaired('bo')).toBe(true);
    s.execute('ann').dusk();
    expect(s.impaired('bo')).toBe(false);
  });
  it('the gained ability acts in its own slot the same night', () => {
    const s = scene({ ...cast, bo: 'm2' })
      .start()
      .submit({ ann: ['empath'] });
    expect(s.truth('ann').some((l) => l.includes('alive neighbours'))).toBe(true);
  });
  it('a gained picker wakes from the next night', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['butler'] });
    s.nextNight();
    expect(s.specs('ann').map((x) => x.roleId)).toEqual(['butler']);
  });
  it('can wait, and only once', () => {
    const s = scene(cast).start().submit({ ann: [] }).nextNight();
    expect(s.specs('ann')).toHaveLength(1);
    s.submit({ ann: ['oracle'] }).nextNight();
    expect(s.specs('ann')).toEqual([]);
  });
  it('an impaired Philosopher gains nothing and spends the use', () => {
    const s = scene({ ...cast, ed: 'poisoner' })
      .start()
      .nextNight();
    s.submit({ ann: ['empath'], ed: ['ann'] }).dawn();
    expect(s.impaired('bo')).toBe(false);
    expect(s.state.abilities[s.ability('philosopher')]?.used).toBe(true);
  });
  it('offers only good characters, and not itself', () => {
    const options = scene(cast).start().specs('ann')[0]?.fields[0]?.options ?? [];
    expect(options).toContain('empath');
    expect(options).not.toContain('imp');
    expect(options).not.toContain('philosopher');
  });
});
