import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'fortune_teller', bo: 't1', cy: 'd1', di: 't2', ed: 'poisoner' };
const asks = (...pair: string[]) =>
  scene(cast, { fields: { fortune_teller: { herring: 'di' } } })
    .start()
    .submit({ ann: pair });
describe('Fortune Teller', () => {
  it('sees a Demon, reads the red herring as one, and sees none otherwise', () => {
    expect(asks('cy', 'bo').truth('ann')).toEqual(['cy and bo: Yes, one of them is a Demon.']);
    expect(asks('di', 'bo').truth('ann')).toEqual(['di and bo: Yes, one of them is a Demon.']);
    expect(asks('bo', 'ed').truth('ann')).toEqual(['bo and ed: No, neither is a Demon.']);
  });
  it('impaired, they are given the opposite', () => {
    const s = asks('bo', 'ed').submit({ ed: ['ann'] });
    expect(s.truth('ann')[0]).toMatch(/No/);
    expect(s.row('ann').suggested[0]).toMatch(/Yes/);
  });
  it('the setup checklist blocks until a red herring is set', () => {
    const s = scene(cast);
    expect(s.g.grimoire().setup.checklist.find((c) => c.id === 'red_herring')?.done).toBe(false);
  });
});
