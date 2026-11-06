import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Psychopath', () => {
  it('is a day reminder', () => {
    const s = scene({ ann: 'psychopath', bo: 't1', cy: 'd1', di: 't2', ed: 't3' }).start();
    expect(s.g.view('ann' as never).me.role?.name).toBe('Psychopath');
    expect(s.specs('ann')).toEqual([]);
  });
});
