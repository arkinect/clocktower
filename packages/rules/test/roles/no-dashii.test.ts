import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('No Dashii', () => {
  it('poisons the nearest Townsfolk each way', () => {
    const s = scene({ ann: 'no_dashii', bo: 'm1', cy: 'empath', di: 't1', ed: 't2' }).start();
    expect(s.impaired('cy')).toBe(true);
    expect(s.impaired('ed')).toBe(true);
    expect(s.impaired('di')).toBe(false);
  });
  it('the poison ends with the No Dashii', () => {
    const s = scene({ ann: 'no_dashii', bo: 'm1', cy: 'empath', di: 't1', ed: 't2' }).start().dawn();
    s.execute('ann');
    expect(s.impaired('cy')).toBe(false);
  });
});
