import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'goon', bo: 'poisoner', cy: 'imp', di: 'empath', ed: 'butler' };
describe('Goon', () => {
  it('the first chooser is drunk and the Goon takes their alignment', () => {
    const s = scene(cast)
      .start()
      .submit({ bo: ['ann'], ed: ['ann'] })
      .dawn();
    expect(s.alignment('ann')).toBe('evil');
    expect(s.impaired('bo')).toBe(true);
    expect(s.impaired('ed')).toBe(false);
    expect(s.impaired('ann')).toBe(false);
  });
});
