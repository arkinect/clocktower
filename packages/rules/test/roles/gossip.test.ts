import { describe, expect, it } from 'vitest';
import { pid } from '../helpers/game';
import { scene } from '../scenario';

const cast = { ann: 'gossip', bo: 't1', cy: 'imp', di: 'poisoner', ed: 'sailor' };
const said = (value: string) => {
  const s = scene(cast).start().dawn();
  s.act('gossip', 'statement', [value]);
  return s;
};
describe('Gossip', () => {
  it('a true statement costs a life tonight, and protections hold', () => {
    const s = said('true').dusk().decide('gossip_victim', 'ed');
    expect(s.res.deaths).toEqual([]);
    s.decide('gossip_victim', 'bo').dawn();
    expect(s.alive('bo')).toBe(false);
  });
  it('is a switch on the Day tab, off by default, that can be turned back off', () => {
    const s = scene(cast).start().dawn();
    const row = () => s.dayActions().find((d) => d.roleId === 'gossip');
    expect(row()).toMatchObject({ control: 'toggle', default: ['false'], recorded: null, order: 10, preview: false });
    s.act('gossip', 'statement', ['true']);
    expect(row()?.recorded).toEqual(['true']);
    s.act('gossip', 'statement', ['false']);
    s.dusk();
    expect(s.hasDecision('gossip_victim')).toBe(false);
  });
  it('poisoned or killed before their slot, they kill nobody', () => {
    const poisoned = said('true')
      .dusk()
      .submit({ di: ['ann'] })
      .review();
    expect(poisoned.res.deaths).toEqual([]);
    const killed = said('true')
      .dusk()
      .submit({ cy: ['ann'] })
      .review();
    expect(killed.res.deaths).toEqual([pid('ann')]);
    expect(killed.hasDecision('gossip_victim')).toBe(false);
  });
});
