import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

describe('Drunk', () => {
  it('sees the believed character and stays impaired', () => {
    const s = scene({ ann: 'drunk', bo: 't1', cy: 'd1', di: 't2', ed: 't3' }, { believed: { ann: 'empath' } }).start();
    expect(s.g.view(pid('ann') as never).me.role?.name).toBe('Empath');
    expect(s.impaired('ann')).toBe(true);
    expect(s.character('ann')).toBe('drunk');
  });
  it('must believe a Townsfolk', () => {
    const s = scene({ ann: 'drunk', bo: 't1', cy: 'd1', di: 't2', ed: 't3' });
    expect(
      s.g.rejected(pid('st'), { type: 'set_believed', playerId: pid('ann') as never, roleId: 'imp' as never }),
    ).toBeTruthy();
  });
});
