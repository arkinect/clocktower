import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const ring = { ann: 't1', bo: 'tea_lady', cy: 't2', di: 'imp', ed: 't3' };
describe('Tea Lady', () => {
  it('protects good neighbours', () => {
    const s = scene(ring)
      .start()
      .nextNight()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(true);
  });
  it('not when a neighbour is evil', () => {
    const s = scene({ ...ring, ann: 'm1' })
      .start()
      .nextNight()
      .submit({ di: ['cy'] })
      .dawn();
    expect(s.alive('cy')).toBe(false);
  });
  it('not from a dead Tea Lady', () => {
    const s = scene(ring).start().dawn();
    s.execute('bo')
      .dusk()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
  });
  it('a poisoned Tea Lady logs the failure', () => {
    const s = scene({ ...ring, ed: 'poisoner' })
      .start()
      .nextNight()
      .submit({ di: ['ann'], ed: ['bo'] });
    expect(s.res.malfunctions.map((m) => m.detail)).toContain('Tea Lady protection failed');
    s.dawn();
    expect(s.alive('ann')).toBe(false);
  });
});
