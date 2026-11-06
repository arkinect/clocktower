import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'empath', bo: 'recluse', cy: 't1', di: 'd1', ed: 't2' };
describe('Recluse', () => {
  it('registers truthfully by default', () => {
    expect(scene(cast).start().truth('ann')).toEqual(['0 of your alive neighbours are evil.']);
  });
  it('can register evil to one asker, which counts as a malfunction', () => {
    const s = scene(cast).start().review();
    const d = s.res.decisions.find((x) => x.key.kind === 'registration');
    s.g.st({ type: 'decide', key: d!.key, option: 'minion' });
    expect(s.truth('ann')).toEqual(['1 of your alive neighbours is evil.']);
    expect(s.res.malfunctions.map((m) => m.cause)).toContain('recluse');
  });
  it('a poisoned Recluse asks nothing', () => {
    const s = scene({ ...cast, cy: 'poisoner' })
      .start()
      .submit({ cy: ['bo'] });
    expect(s.res.decisions.some((x) => x.key.kind === 'registration')).toBe(false);
  });
});
