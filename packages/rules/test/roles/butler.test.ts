import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'butler', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' };
describe('Butler', () => {
  it('chooses a master, not themselves', () => {
    const s = scene(cast).start();
    expect(s.specs('ann')[0]?.fields[0]?.options).not.toContain('ann');
    s.submit({ ann: ['bo'] });
    expect(s.truth('ann')).toEqual(['Your master is bo.']);
    s.dawn();
    expect(s.g.grimoire().dayNotices).toContain('ann (Butler) may only vote if bo votes.');
  });
  it('an impaired Butler still hears who they chose, but has no master', () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .submit({ ann: ['bo'], bo: ['ann'] })
      .dawn();
    expect(s.g.grimoire().dayNotices).toEqual([]);
  });
});
