// An execution is a choice during the day. It happens at dusk (Start Night), to whoever was chosen last, and then
// triggers what it triggers for other characters (Cannibal, Mastermind, Mayor).
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
const executions = (s: Scene) => s.state.events.filter((e) => e.kind === 'execution');
const life = (s: Scene, id: string) => s.g.player(id as PlayerId).life;

describe('execution at dusk', () => {
  const cast = { ann: 'cannibal', bo: 'empath', cy: 'imp', di: 'mastermind', ed: 'oracle', fi: 't3' };

  it('the chosen player dies at dusk, and the Cannibal eats then', () => {
    const s = scene(cast).start().dawn().execute('bo');
    expect(s.alive('bo')).toBe(true);
    expect(eaten(s)).toEqual([]);
    s.dusk();
    expect(life(s, 'bo')).toMatchObject({ alive: false, cause: 'execution', diedAt: { kind: 'day', n: 1 } });
    expect(executions(s)).toMatchObject([{ playerId: 'bo', died: true }]);
    expect(eaten(s)).toEqual(['empath']);
  });

  it('a changed choice: only the last is executed', () => {
    const s = scene(cast).start().dawn().execute('bo').execute('ed');
    expect(executions(s)).toHaveLength(1);
    s.dusk();
    expect(s.alive('bo')).toBe(true);
    expect(s.alive('ed')).toBe(false);
    expect(eaten(s)).toEqual(['oracle']);
  });

  it('"No execution" calls it off', () => {
    const s = scene(cast).start().dawn().execute('bo').execute(null).dusk();
    expect(s.alive('bo')).toBe(true);
    expect(eaten(s)).toEqual([]);
  });

  it('executed without dying, by the Storyteller: nothing is eaten', () => {
    const s = scene(cast).start().dawn().execute('bo', false).dusk();
    expect(s.alive('bo')).toBe(true);
    expect(executions(s)).toMatchObject([{ playerId: 'bo', died: false }]);
    expect(eaten(s)).toEqual([]);
  });

  it('a chosen player who dies another way first: the execution kills nobody', () => {
    const s = scene(cast).start().dawn().execute('bo').kill('bo').dusk();
    expect(life(s, 'bo').cause).toBe('storyteller');
    expect(executions(s)).toMatchObject([{ playerId: 'bo', died: false }]);
    expect(eaten(s)).toEqual([]);
  });

  it('the Demon executed with a Mastermind: the extra day starts at dusk', () => {
    const s = scene(cast).start().dawn().execute('cy');
    expect(s.alive('cy')).toBe(true);
    s.dusk();
    expect(s.alive('cy')).toBe(false);
    expect(extraDay(s)).toBe(2);
    expect(s.state.gameEnd).toEqual([]);
  });

  it('no execution with 3 alive and a Mayor: the night starts, and the win is stored but not shown', () => {
    const s = scene({ ann: 'mayor', bo: 't1', cy: 'imp', di: 't2', ed: 'm1' }).start().dawn();
    s.execute('bo').dusk().dawn();
    s.kill('ed');
    s.dusk();
    expect(s.state.phase.kind).toBe('night');
    expect(s.state.gameEnd.find((g) => g.key === 'mayor')?.winner).toBe('good');
  });
});
