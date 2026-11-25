import { describe, expect, it } from 'vitest';
import { as } from '../helpers/scene';
import { scene } from '../scenario';

describe('Empath', () => {
  it('counts evil among alive neighbours', () => {
    const s = scene({ ann: 'empath', bo: 'm1', cy: 't1', di: 't2', ed: 'd1' }).start();
    expect(s.truth('ann')).toEqual(['2 of your alive neighbours are evil.']);
  });
  it('steps past dead neighbours', () => {
    const s = scene({ ann: 'empath', bo: 't1', cy: 'm1', di: 't2', ed: 't3', fi: 'd1' }).start().dawn();
    s.execute('bo').dusk();
    expect(s.truth('ann')).toEqual(['2 of your alive neighbours are evil.']);
  });
  it('a dead Empath does not wake', () => {
    const s = scene({ ann: 'empath', bo: 't1', cy: 'm1', di: 't2', ed: 'd1' }).start().dawn();
    s.execute('ann').dusk();
    expect(s.truth('ann')).toEqual([]);
  });
  it('poisoned, they get false information, and their phone cannot tell', () => {
    const s = scene({ ann: 'empath', bo: 'imp', cy: 'poisoner', di: 't1', ed: 't2' })
      .start()
      .submit({ cy: ['ann'] })
      .review();
    const r = s.row('ann');
    expect(r.truth[0]).toMatch(/^1 /);
    expect(r.impaired).toBe(true);
    expect(r.causes.join(' ')).toMatch(/Poisoner/);
    expect(r.suggested[0]).toMatch(/^(0|2) /);
    expect(r.final).toEqual(r.suggested);
    s.dawn();
    const view = s.g.view(as('ann'));
    expect(view.me.messages.filter((m) => m.title === 'Empath').at(-1)?.lines).toEqual(r.suggested);
    expect(JSON.stringify(view)).not.toMatch(/impaired|causes|poisoned/i);
  });
});
