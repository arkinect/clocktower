import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'gossip', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Gossip', () => {
  it('a true statement costs a life tonight', () => {
    const s = scene(cast).start().dawn();
    s.act('gossip', 'statement', ['true']);
    s.dusk().decide('gossip_victim', 'bo').dawn();
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
  it('a false statement does nothing', () => {
    const s = scene(cast).start().dawn();
    s.act('gossip', 'statement', ['false']);
    s.dusk();
    expect(s.hasDecision('gossip_victim')).toBe(false);
  });
});
