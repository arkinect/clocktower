import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'farmer', bo: 't1', cy: 'imp', di: 'm1', ed: 't3' };
describe('Farmer', () => {
  it('passes on when killed at night', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .decide('farmer', 'bo')
      .dawn();
    expect(s.character('bo')).toBe('farmer');
    expect(s.alignment('bo')).toBe('good');
    expect(s.inbox('bo')).toContain('You are now the Farmer');
  });
  it('not when executed', () => {
    const s = scene(cast).start().dawn();
    s.execute('ann')
      .dusk()
      .submit({ cy: ['bo'] });
    expect(s.hasDecision('farmer')).toBe(false);
  });
  it('not when impaired at death', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'], di: ['ann'] });
    expect(s.hasDecision('farmer')).toBe(false);
  });
  it('the Storyteller can choose nobody', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .decide('farmer', 'nobody')
      .dawn();
    expect(s.character('bo')).not.toBe('farmer');
  });
});
