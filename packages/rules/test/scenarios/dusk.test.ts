// An execution is a choice during the day. It happens at dusk (Start Night), to whoever was chosen last, and then
// triggers what it triggers for other characters (here the Cannibal).
import { describe, expect, it } from 'vitest';
import { scene, type Scene } from '../scenario';
import { pid } from '../helpers/game';

const eaten = (s: Scene) =>
  [...s.state.abilities.values()]
    .filter((a) => a.holder.kind === 'player' && a.holder.id === pid('ann') && a.origin.kind !== 'character')
    .filter((a) => a.activeUntil !== 'removed')
    .map((a) => a.roleId as string);
const executions = (s: Scene) => s.state.events.filter((e) => e.kind === 'execution');
const life = (s: Scene, id: string) => s.g.player(pid(id)).life;

describe('execution at dusk', () => {
  const cast = { ann: 'cannibal', bo: 'empath', cy: 'imp', di: 'mastermind', ed: 'oracle', fi: 't3' };

  it('the chosen player dies at dusk, and the Cannibal eats then', () => {
    const s = scene(cast).start().dawn().execute('bo');
    expect(s.alive('bo')).toBe(true);
    expect(eaten(s)).toEqual([]);
    s.dusk();
    expect(life(s, 'bo')).toMatchObject({ alive: false, cause: 'execution', diedAt: { kind: 'day', n: 1 } });
    expect(executions(s)).toMatchObject([{ playerId: pid('bo'), died: true }]);
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
    expect(executions(s)).toMatchObject([{ playerId: pid('bo'), died: false }]);
    expect(eaten(s)).toEqual([]);
  });

  it('a chosen player who dies another way first: the execution kills nobody', () => {
    const s = scene(cast).start().dawn().execute('bo').kill('bo').dusk();
    expect(life(s, 'bo').cause).toBe('storyteller');
    expect(executions(s)).toMatchObject([{ playerId: pid('bo'), died: false }]);
    expect(eaten(s)).toEqual([]);
  });
});
