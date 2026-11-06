import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Empath', () => {
  it('counts evil among alive neighbours', () => {
    const s = scene({ ann: 'empath', bo: 'm1', cy: 't1', di: 't2', ed: 'd1' }).start();
    expect(s.truth('ann')).toEqual(['2 of your alive neighbours are evil.']);
  });
  it('steps past dead neighbours', () => {
    const s = scene({ ann: 'empath', bo: 't1', cy: 'm1', di: 't2', ed: 't3', fi: 'd1' }).start().dawn();
    s.execute('bo').dusk();
    expect(s.truth('ann')).toEqual(['2 of your alive neighbours are evil.']);
  });
  it('a dead Empath does not wake', () => {
    const s = scene({ ann: 'empath', bo: 't1', cy: 'm1', di: 't2', ed: 'd1' }).start().dawn();
    s.execute('ann').dusk();
    expect(s.truth('ann')).toEqual([]);
  });
});
