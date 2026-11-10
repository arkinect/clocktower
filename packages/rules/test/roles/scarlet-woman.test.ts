import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@ct/protocol';
import { TRAVELLER } from '../helpers/plain';
import { scene } from '../scenario';

const cast = { ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2', ed: 't3', fi: 't4' };
const mastermind = (s: ReturnType<typeof scene>) =>
  (s.state.abilities[s.ability('mastermind')]?.state as { extraDay: number | null }).extraDay;

describe('Scarlet Woman', () => {
  it('takes over at Start Night when the Demon is executed with 5 or more alive, with nothing to confirm', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann');
    expect(s.state.prompts).toEqual([]);
    expect(s.character('bo')).toBe('scarlet_woman');
    s.dusk();
    expect(s.character('bo')).toBe('imp');
    expect(s.inbox('bo')).toContain('You are now the Imp');
    expect(s.specs('bo')[0]?.roleId).toBe('imp');
    s.review();
    expect(s.hasDecision('scarlet_woman')).toBe(false);
  });
  it('holds the game end for the rest of the day', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann');
    expect(s.state.gameEnd).toEqual([]);
  });
  it('not when she is poisoned at Start Night', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann');
    s.g.st({ type: 'add_condition', target: 'bo' as PlayerId, condition: 'poisoned' });
    s.dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
  });
  it("not when the Demon's execution is called off before Start Night", () => {
    const s = scene(cast).start().dawn();
    s.execute('ann').execute(null);
    s.dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
    expect(s.character('ann')).toBe('imp');
  });
  it('not with fewer than 5 alive', () => {
    const s = scene({ ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2' }).start().dawn();
    s.execute('ann').dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
  });
  it('the Demon marked dead with the Dead button: the same handover at Start Night', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'ann' as PlayerId, alive: false });
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
  it('does not count Travellers towards the 5', () => {
    const s = scene({ ann: 'imp', bo: 'scarlet_woman', cy: 't1', di: 't2', vi: TRAVELLER[0] as string })
      .start()
      .dawn();
    expect(s.state.seats.filter((x) => s.alive(x.playerId))).toHaveLength(5);
    s.execute('ann').dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
  });
  it('still counts every non-Traveller, with a Traveller at the table', () => {
    const s = scene({ ...cast, vi: TRAVELLER[0] as string })
      .start()
      .dawn();
    s.execute('ann').dusk();
    expect(s.character('bo')).toBe('imp');
  });
  it('catches a night kill of the Demon, as a Review decision', () => {
    const s = scene({ ...cast, cy: 'assassin' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .review();
    expect(s.hasDecision('scarlet_woman')).toBe(true);
    s.dawn();
    expect(s.character('bo')).toBe('imp');
  });
  it('a Scarlet Woman poisoned when the Demon dies does nothing', () => {
    const s = scene({ ...cast, cy: 'poisoner' })
      .start()
      .submit({ cy: ['bo'] })
      .dawn();
    s.execute('ann').dusk();
    expect(s.character('bo')).toBe('scarlet_woman');
  });
});
