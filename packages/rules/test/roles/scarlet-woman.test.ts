import { describe, expect, it } from 'vitest';
import { TRAVELLER } from '../helpers/plain';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2', ed: 't3', fi: 't4' };
const mastermind = (s: ReturnType<typeof scene>) =>
  (s.state.abilities.get(s.ability('mastermind'))?.state as { extraDay: number | null }).extraDay;

describe('Scarlet Woman', () => {
  it('takes over at Start Night when the Demon is executed with 5 or more alive, with nothing to confirm', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann');
    expect(s.state.gameEnd).toEqual([]);
    expect(s.character('bo')).toBe('scarlet_woman');
    s.dusk();
    expect(s.character('bo')).toBe('imp');
    expect(s.inbox('bo')).toContain('You are now the Imp');
    expect(s.specs('bo')[0]?.roleId).toBe('imp');
    expect(s.review().res.decisions).toEqual([]);
  });
  it("not when the Demon's execution is called off before Start Night", () => {
    const s = scene(cast).start().dawn();
    s.execute('ann').execute(null);
    s.dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
    expect(s.character('ann')).toBe('imp');
  });
  it('the Demon marked dead with the Dead button: the same handover at Start Night', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: pid('ann'), alive: false });
    s.dusk();
    expect(s.character('bo')).toBe('imp');
  });
  it('with a Mastermind: she takes over, and there is no extra day', () => {
    const s = scene({ ...cast, cy: 'mastermind' })
      .start()
      .dawn();
    s.execute('ann').dusk();
    expect(s.character('bo')).toBe('imp');
    expect(mastermind(s)).toBeNull();
  });
  it.each([
    ['4 alive', { ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2' }],
    ['4 alive and a Traveller', { ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2', vi: TRAVELLER[0] as string }],
  ])('not with %s', (_name, chars) => {
    const s = scene(chars).start().dawn().execute('ann').dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
  });
  it('not when she is poisoned as the Demon dies', () => {
    const s = scene({ ...cast, cy: 'poisoner' })
      .start()
      .submit({ cy: ['bo'] })
      .dawn();
    s.execute('ann').dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
  });
});
