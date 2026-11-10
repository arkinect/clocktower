// An execution kills at once. What it triggers for other characters (Cannibal, Mastermind, Mayor) waits for dusk, and
// reads the day's final execution record.
import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@ct/protocol';
import { scene, type Scene } from '../scenario';

const eaten = (s: Scene) =>
  Object.values(s.state.abilities)
    .filter((a) => a.holder.kind === 'player' && a.holder.id === 'ann' && a.origin.kind !== 'character')
    .filter((a) => a.activeUntil !== 'removed')
    .map((a) => a.roleId as string);
const extraDay = (s: Scene) =>
  (s.state.abilities[s.ability('mastermind')]?.state as { extraDay: number | null }).extraDay;
const revive = (s: Scene, id: string) => s.g.st({ type: 'mark_alive', playerId: id as PlayerId, alive: true });
const executions = (s: Scene) => s.state.events.filter((e) => e.kind === 'execution');

describe('execution at dusk', () => {
  const cast = { ann: 'cannibal', bo: 'empath', cy: 'imp', di: 'mastermind', ed: 'oracle', fi: 't3' };

  it('kills at once, but the Cannibal eats only at dusk', () => {
    const s = scene(cast).start().dawn().execute('bo');
    expect(s.alive('bo')).toBe(false);
    expect(eaten(s)).toEqual([]);
    s.dusk();
    expect(eaten(s)).toEqual(['empath']);
  });

  it('revived before dusk, the execution triggers nothing', () => {
    const s = scene(cast).start().dawn().execute('bo');
    revive(s, 'bo');
    s.dusk();
    expect(eaten(s)).toEqual([]);

    const t = scene(cast).start().dawn().execute('cy');
    revive(t, 'cy');
    t.dusk();
    expect(extraDay(t)).toBeNull();
  });

  it('a second record replaces the first: only it counts at dusk', () => {
    const s = scene(cast).start().dawn().execute('bo');
    revive(s, 'bo');
    s.execute('ed');
    expect(executions(s)).toHaveLength(1);
    s.dusk();
    expect(eaten(s)).toEqual(['oracle']);
  });

  it('the earlier player stays dead when the record changes', () => {
    const s = scene(cast).start().dawn().execute('bo').execute('ed');
    expect(s.dead('bo', 'ed')).toBe(true);
    s.dusk();
    expect(eaten(s)).toEqual(['oracle']);
  });

  it('"No execution" replaces an execution too', () => {
    const s = scene(cast).start().dawn().execute('bo');
    revive(s, 'bo');
    s.execute(null).dusk();
    expect(eaten(s)).toEqual([]);
  });

  it('the Demon executed with a Mastermind: the extra day starts at dusk', () => {
    const s = scene(cast).start().dawn().execute('cy');
    expect(extraDay(s)).toBeNull();
    s.dusk();
    expect(extraDay(s)).toBe(2);
    expect(s.state.gameEnd).toEqual([]);
  });

  it('no execution with 3 alive and a Mayor: the night starts, and the win is stored but not shown', () => {
    const s = scene({ ann: 'mayor', bo: 't1', cy: 'imp', di: 't2', ed: 'm1' }).start().dawn();
    s.execute('bo').dusk().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'ed' as PlayerId, alive: false });
    s.dusk();
    expect(s.state.phase.kind).toBe('night');
    expect(s.state.gameEnd.find((g) => g.key === 'mayor')?.winner).toBe('good');
  });
});
