import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'godfather', bo: 'recluse', cy: 'imp', di: 'zealot', ed: 't2' };
const opts = { fields: { godfather: { outsiders: '+1' } } };
describe('Godfather', () => {
  it('learns the Outsiders', () => {
    const s = scene(cast, opts).start();
    expect(s.truth('ann')).toEqual(['Outsiders in play: Recluse, Zealot']);
  });
  it('may hide the Recluse', () => {
    const s = scene(cast, opts).start().decide('godfather_recluse', 'hide');
    expect(s.truth('ann')).toEqual(['Outsiders in play: Zealot']);
  });
  it('kills after an Outsider died today', () => {
    const s = scene(cast, opts).start().dawn();
    s.execute('di')
      .dusk()
      .submit({ ann: ['ed'] })
      .dawn();
    expect(s.alive('ed')).toBe(false);
  });
  it('sleeps otherwise, unless the Storyteller says so', () => {
    const s = scene(cast, opts).start().nextNight();
    expect(s.specs('ann')).toEqual([]);
    expect(s.decision('godfather_trigger').default).toBe('no');
  });
  it('changes the Outsider count by the setup field', () => {
    const s = scene({ ...cast, bo: 't1', di: 't3' }, opts);
    expect(s.g.grimoire().setup.counts.target).toEqual([2, 1, 1, 1]);
  });
});
