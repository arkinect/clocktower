import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Fisherman', () => {
  it('is a manual once-per-game day ability', () => {
    const s = scene({ ann: 'fisherman', bo: 't1', cy: 'd1', di: 't2', ed: 't3' }).start().dawn();
    s.g.st({ type: 'set_ability_used', abilityId: s.ability('fisherman'), used: true });
    expect(s.state.abilities[s.ability('fisherman')]?.used).toBe(true);
  });
});
