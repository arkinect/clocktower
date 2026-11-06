import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'fortune_teller', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' };
const opts = { fields: { fortune_teller: { herring: 'di' } } };
describe('Fortune Teller', () => {
  it('sees a Demon', () => {
    const s = scene(cast, opts)
      .start()
      .submit({ ann: ['cy', 'bo'] });
    expect(s.truth('ann')).toEqual(['cy and bo: Yes, one of them is a Demon.']);
  });
  it('the red herring reads as a Demon', () => {
    const s = scene(cast, opts)
      .start()
      .submit({ ann: ['di', 'bo'] });
    expect(s.truth('ann')).toEqual(['di and bo: Yes, one of them is a Demon.']);
  });
  it('sees no Demon', () => {
    const s = scene(cast, opts)
      .start()
      .submit({ ann: ['bo', 'ed'] });
    expect(s.truth('ann')).toEqual(['bo and ed: No, neither is a Demon.']);
  });
  it('the setup checklist blocks until a red herring is set', () => {
    const s = scene(cast);
    expect(s.g.grimoire().setup.checklist.find((c) => c.id === 'red_herring')?.done).toBe(false);
  });
});
