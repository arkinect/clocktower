import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

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
  it('is told at dawn that they changed sides, each time they do', () => {
    const s = scene(cast)
      .start()
      .submit({ bo: ['ann'] })
      .review();
    expect(s.inbox('ann')).not.toContain('You are now evil.');
    s.dawn();
    expect(s.inbox('ann')).toContain('You are now evil.');
    s.dusk()
      .submit({ bo: ['di'], ed: ['ann'] })
      .dawn();
    expect(s.alignment('ann')).toBe('good');
    expect(s.inbox('ann')).toContain('You are now good.');
  });
  it('is told nothing when chosen by a player on their own side', () => {
    const s = scene(cast)
      .start()
      .submit({ ed: ['ann'] })
      .dawn();
    expect(s.alignment('ann')).toBe('good');
    expect(s.inbox('ann')).not.toContain('You are now');
  });
  it('is told nothing while drunk or poisoned, as they do not change sides', () => {
    const s = scene(cast).start();
    s.g.st({ type: 'add_condition', target: pid('ann'), condition: 'drunk' });
    s.submit({ bo: ['ann'] }).dawn();
    expect(s.alignment('ann')).toBe('good');
    expect(s.inbox('ann')).not.toContain('You are now');
  });
});
