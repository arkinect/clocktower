import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'juggler', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
const dayAction = (s: ReturnType<typeof scene>) => ({
  type: 'day_action' as const,
  abilityId: s.ability('juggler'),
  action: 'guesses',
  mode: 'accept' as const,
});
describe('Juggler', () => {
  it('learns how many of the day 1 guesses were right', () => {
    const s = scene(cast).start().dawn();
    s.act('juggler', 'guesses', ['bo', 't1', 'cy', 'd1', 'di', 't2', 'ed', 't1']);
    s.dusk();
    expect(s.truth('ann')).toEqual(['You guessed 3 correctly.']);
  });
  it('records up to 5 guesses as rows, and none clears them', () => {
    const s = scene(cast).start().dawn();
    const row = () => s.dayActions().find((d) => d.roleId === 'juggler');
    expect(row()).toMatchObject({ control: 'rows', maxRows: 5, recorded: null, preview: false });
    s.act('juggler', 'guesses', ['bo', 't1']);
    expect(row()?.recorded).toHaveLength(2);
    expect(s.g.rejected('st' as never, { ...dayAction(s), values: ['bo'] })).toMatch(/every part/);
    expect(s.g.rejected('st' as never, { ...dayAction(s), values: Array(12).fill('bo') })).toMatch(/at most 5/);
    s.act('juggler', 'guesses', []);
    expect(row()?.recorded).toBeNull();
    s.dusk();
    expect(s.truth('ann')).toEqual(['You guessed 0 correctly.']);
  });
  it('only that night', () => {
    const s = scene(cast).start().dawn();
    s.act('juggler', 'guesses', ['bo', 't1', 'cy', 'd1', 'di', 't2']);
    s.nextNight().nextNight();
    expect(s.truth('ann')).toEqual([]);
  });
});
