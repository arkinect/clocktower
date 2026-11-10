import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'fool', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Fool', () => {
  it('survives the first death only', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(true);
    s.dusk()
      .submit({ cy: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
  });
  it('an impaired Fool keeps the save', () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'], bo: ['ann'] });
    s.dawn();
    expect(s.alive('ann')).toBe(false);
    expect(Object.values(s.state.abilities).find((a) => a.roleId === ('fool' as never))?.used).toBe(false);
  });

  const foolUsed = (s: ReturnType<typeof scene>) =>
    Object.values(s.state.abilities).find((a) => a.roleId === ('fool' as never))?.used;

  it('survives a first execution, which still counts as the execution', () => {
    const s = scene(cast).start().dawn().execute('ann');
    expect(s.alive('ann')).toBe(true);
    expect(foolUsed(s)).toBe(true);
    expect(s.state.events.findLast((e) => e.kind === 'execution')).toMatchObject({ playerId: 'ann', died: false });
    s.dusk().dawn().execute('ann');
    expect(s.alive('ann')).toBe(false);
  });

  it('recording the same execution again does not spend the save twice', () => {
    const s = scene(cast).start().dawn().execute('ann').execute('ann');
    expect(s.alive('ann')).toBe(true);
  });
});
