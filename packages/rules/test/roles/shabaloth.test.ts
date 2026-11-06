import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'shabaloth', bo: 't1', cy: 't2', di: 't3', ed: 't4', fi: 't5', gu: 'm1' };
describe('Shabaloth', () => {
  it('kills two a night', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'cy'] })
      .dawn();
    expect(s.dead('bo', 'cy')).toBe(true);
  });
  it('can bring back an earlier victim', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'cy'] })
      .dawn()
      .dusk();
    s.submit({ ann: ['di', 'ed'] })
      .decide('shabaloth', 'bo')
      .dawn();
    expect(s.alive('bo')).toBe(true);
    expect(s.alive('cy')).toBe(false);
  });
});
