import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'professor', bo: 'empath', cy: 'imp', di: 'm1', ed: 'recluse' };
describe('Professor', () => {
  it('resurrects a dead Townsfolk', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo')
      .dusk()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.alive('bo')).toBe(true);
  });
  it('an Outsider stays dead and the use is spent', () => {
    const s = scene(cast).start().dawn();
    s.execute('ed')
      .dusk()
      .submit({ ann: ['ed'] })
      .dawn();
    expect(s.alive('ed')).toBe(false);
    s.execute('bo').dusk();
    expect(s.specs('ann')).toEqual([]);
  });
  it('picks only from the dead', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo').dusk();
    expect(s.specs('ann')[0]?.fields[0]?.options).toEqual(['bo']);
  });
});
