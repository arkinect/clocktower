import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'organ_grinder', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
describe('Organ Grinder', () => {
  it('shows eyes-closed voting while sober', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['sober'] })
      .dawn();
    expect(s.g.grimoire().dayNotices.join(' ')).toContain('Eyes-closed');
  });
  it('can choose to be drunk until dusk', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['drunk'] })
      .dawn();
    expect(s.impaired('ann')).toBe(true);
    expect(s.g.grimoire().dayNotices).toEqual([]);
    s.dusk();
    expect(s.impaired('ann')).toBe(false);
  });
});
