import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'ravenkeeper', bo: 'empath', cy: 'imp', di: 't2', ed: 't3' };
describe('Ravenkeeper', () => {
  it('asks only after dying at night', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .review();
    expect(s.res.questions.map((q) => q.playerId)).toEqual(['ann']);
    s.answer('ann', ['bo']);
    expect(s.truth('ann')).toEqual(['bo is the Empath.']);
  });
  it('not when executed', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann')
      .dusk()
      .submit({ cy: ['bo'] });
    expect(s.res.questions).toEqual([]);
  });
  it('sees a poisoned result as false', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'], di: ['ann'] });
    s.answer('ann', ['bo']);
    expect(s.row('ann').impaired).toBe(true);
    expect(s.row('ann').final).not.toEqual(['bo is the Empath.']);
  });
});
