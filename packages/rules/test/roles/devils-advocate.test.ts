import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'devils_advocate', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
const executions = (s: ReturnType<typeof scene>) =>
  s.state.events.filter((e) => e.kind === 'execution').map((e) => e.kind === 'execution' && [e.playerId, e.died]);

describe("Devil's Advocate", () => {
  it('marks a player and cannot repeat them the next night', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.g.grimoire().dayNotices).toContain('bo does not die if executed today.');
    s.dusk();
    expect(s.specs('ann')[0]?.fields[0]?.options).not.toContain('bo');
  });

  it('the marked player is executed at dusk and does not die', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn()
      .execute('bo')
      .dusk();
    expect(s.alive('bo')).toBe(true);
    expect(executions(s)).toEqual([['bo', false]]);
  });

  it('anyone else executed dies', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn()
      .execute('di')
      .dusk();
    expect(s.alive('di')).toBe(false);
    expect(executions(s)).toEqual([['di', true]]);
  });

  it('protects only the day after the choice', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['bo'] })
      .dawn()
      .dusk()
      .submit({ ann: ['di'] })
      .dawn()
      .execute('bo')
      .dusk();
    expect(s.alive('bo')).toBe(false);
  });

  it('a marked Fool keeps their own save', () => {
    const s = scene({ ...cast, bo: 'fool' })
      .start()
      .submit({ ann: ['bo'] })
      .dawn()
      .execute('bo')
      .dusk();
    expect(s.alive('bo')).toBe(true);
    expect(Object.values(s.state.abilities).find((a) => a.roleId === ('fool' as never))?.used).toBe(false);
  });
});
