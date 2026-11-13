import { describe, expect, it } from 'vitest';
import { as } from './lib';
import { scene } from '../scenario';

// The Review tab shows only drunk or poisoned players' results. Everyone else's follows from the night as decided
// there, and nothing reaches a player until dawn is published.
describe('Review and dawn', () => {
  it("a sober player's hidden result follows the Storyteller's choices on the Review tab", () => {
    const s = scene({ ann: 'empath', bo: 'recluse', cy: 'imp', di: 'poisoner', ed: 'butler' })
      .start()
      .submit({ di: ['ed'] })
      .review();
    expect(s.row('ann').impaired).toBe(false);
    expect(s.final('ann').join(' ')).toMatch(/\b0\b/);
    s.decide('registration', 'demon');
    expect(s.final('ann').join(' ')).toMatch(/\b1\b/);
    s.dawn();
    expect(s.inbox('ann').join(' ')).toMatch(/\b1\b/);
  });

  it('nothing reaches a player before dawn: results or notices', () => {
    const s = scene(
      { ann: 'mezepheles', bo: 'empath', cy: 'imp', di: 't1', ed: 't2' },
      {
        fields: { mezepheles: { word: 'apple' } },
      },
    )
      .start()
      .dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk().review();
    const before = s.inbox('bo').length;
    expect(s.inbox('bo')).not.toContain('You are now evil.');
    s.dawn();
    expect(s.inbox('bo')).toContain('You are now evil.');
    expect(s.inbox('bo').length).toBeGreaterThan(before);
  });

  it('a Scarlet Woman who takes over at night sees her new character only at dawn', () => {
    const s = scene({ ann: 'imp', bo: 'scarlet_woman', cy: 'assassin', di: 't1', ed: 't2', fi: 't3' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .review();
    const card = () => s.g.view(as('bo')).me.role?.roleId;
    expect(card()).toBe('scarlet_woman');
    expect(s.inbox('bo').join(' ')).not.toMatch(/Imp/);
    s.dawn();
    expect(card()).toBe('imp');
  });
});
