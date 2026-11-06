import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'seamstress', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' };
describe('Seamstress', () => {
  it('compares two alignments, once', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo', 'cy'] });
    expect(s.truth('ann')).toEqual(['bo and cy are different alignments.']);
    s.nextNight();
    expect(s.specs('ann')).toEqual([]);
  });
  it('can wait and cannot pick themselves', () => {
    const s = scene(cast).start();
    expect(s.specs('ann')[0]?.fields[0]?.options).not.toContain('ann');
    s.submit({ ann: [] }).nextNight();
    expect(s.specs('ann')).toHaveLength(1);
  });
});
