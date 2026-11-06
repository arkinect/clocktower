import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'devils_advocate', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
describe("Devil's Advocate", () => {
  it('marks a player and cannot repeat them the next night', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.g.grimoire().dayNotices).toContain('bo does not die if executed today.');
    s.dusk();
    expect(s.specs('ann')[0]?.fields[0]?.options).not.toContain('bo');
  });
});
