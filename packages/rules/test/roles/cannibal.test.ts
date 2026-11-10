import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'cannibal', bo: 'empath', cy: 'imp', di: 'm1', ed: 't2', fi: 't3' };
const eaten = (s: ReturnType<typeof scene>) =>
  Object.values(s.state.abilities).filter(
    (a) =>
      a.holder.kind === 'player' &&
      a.holder.id === 'ann' &&
      a.origin.kind !== 'character' &&
      a.activeUntil !== 'removed',
  );
describe('Cannibal', () => {
  it('eats a good executee and gets their ability, shown as Cannibal', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo');
    // The execution kills at once, but the Cannibal eats at dusk.
    expect(eaten(s)).toEqual([]);
    s.dusk();
    expect(eaten(s).map((a) => a.roleId)).toEqual(['empath']);
    expect(eaten(s)[0]?.shownAs).toBe('cannibal');
    expect(s.truth('ann').length).toBe(1);
  });
  it('an evil executee poisons them until a good player is executed', () => {
    const s = scene(cast).start().dawn();
    s.execute('di').dusk();
    expect(s.impaired('ann')).toBe(true);
    s.dawn().execute('bo').dusk();
    expect(s.impaired('ann')).toBe(false);
  });
  it('the next eat replaces the last', () => {
    const s = scene({ ...cast, ed: 'oracle' })
      .start()
      .dawn();
    s.execute('bo').dusk().dawn().execute('ed').dusk();
    expect(eaten(s).map((a) => a.roleId)).toEqual(['oracle']);
  });
  it('the Storyteller can set a false ability after an evil eat', () => {
    const s = scene(cast).start().dawn();
    s.execute('di').dusk().dawn();
    s.act('cannibal', 'set_ability', ['oracle']);
    expect(eaten(s)[0]?.perceivedOnly).toBe(true);
    s.dusk();
    expect(s.row('ann').impaired).toBe(true);
  });
  it('dropping the eaten Philosopher drops what it gained, and frees its victim', () => {
    const s = scene({ ...cast, bo: 'philosopher', ed: 'oracle', ann: 'cannibal', fi: 'empath' }).start();
    s.dawn()
      .execute('bo')
      .dusk()
      .submit({ ann: ['empath'] });
    s.dawn();
    expect(s.impaired('fi')).toBe(true);
    s.execute('ed').dusk();
    expect(s.impaired('fi')).toBe(false);
    expect(eaten(s).map((a) => a.roleId)).toEqual(['oracle']);
  });
  it('a dead Cannibal eats nothing', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann').dusk().dawn().execute('bo');
    expect(eaten(s)).toEqual([]);
  });
});
