import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Zealot', () => {
  it('is a reminder that shows while the role is in play', () => {
    const s = scene({ ann: 'zealot', bo: 't1', cy: 'd1', di: 't2', ed: 't3' }).start().dawn();
    const row = s.g.grimoire().players.find((p) => p.id === 'ann');
    expect(row?.abilities.map((a) => a.roleId)).toEqual(['zealot']);
    expect(s.dayActions()).toEqual([]);
  });
});
