import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'fool', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
const foolUsed = (s: ReturnType<typeof scene>) =>
  Object.values(s.state.abilities).find((a) => a.roleId === ('fool' as never))?.used;

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
    expect(foolUsed(s)).toBe(false);
  });

  it('survives a first execution, which still counts as the execution', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk();
    expect(s.alive('ann')).toBe(true);
    expect(foolUsed(s)).toBe(true);
    expect(s.state.events.findLast((e) => e.kind === 'execution')).toMatchObject({ playerId: 'ann', died: false });
    s.dawn().execute('ann').dusk();
    expect(s.alive('ann')).toBe(false);
  });

  it('a choice changed away from the Fool spends nothing', () => {
    const s = scene(cast).start().dawn().execute('ann').execute('bo').dusk();
    expect(s.alive('ann')).toBe(true);
    expect(foolUsed(s)).toBe(false);
  });

  it("poisoned that day, the Fool dies at the execution: the day's poison lasts until it happens", () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .submit({ bo: ['ann'] })
      .dawn()
      .execute('ann')
      .dusk();
    expect(s.alive('ann')).toBe(false);
  });
});
