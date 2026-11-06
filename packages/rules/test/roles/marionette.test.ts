import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'imp', bo: 'marionette', cy: 't1', di: 'm1', ed: 't2', fi: 't3', gu: 't4' };
describe('Marionette', () => {
  it('is drunk, believes a good character and is left out of the Minion info', () => {
    const s = scene(cast, { believed: { bo: 'empath' } }).start();
    expect(s.impaired('bo')).toBe(true);
    expect(s.g.view('bo' as never).me.role?.name).toBe('Empath');
    expect(s.inbox('di').join(' ')).not.toContain('bo');
    expect(s.inbox('ann')).toContain('The Marionette is: bo');
  });
  it('must sit next to the Demon', () => {
    const s = scene({ ...cast, bo: 't5', cy: 'marionette' }, { believed: { cy: 'empath' } });
    expect(
      s.g
        .grimoire()
        .setup.warnings.concat(s.g.grimoire().setup.checklist.map((c) => (c.done ? '' : c.label)))
        .join(' '),
    ).toMatch(/neighbour|next to/i);
  });
});
