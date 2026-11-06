import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Oracle', () => {
  it('counts evil among the dead, from the first night after', () => {
    const s = scene({ ann: 'oracle', bo: 'm1', cy: 't1', di: 't2', ed: 'd1' }).start();
    expect(s.truth('ann')).toEqual([]);
    s.dawn().execute('bo').dusk();
    expect(s.truth('ann')).toEqual(['1 dead player is evil.']);
  });
});
