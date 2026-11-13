import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'virgin', bo: 't1', cy: 'imp', di: 'm1', ed: 't3', fi: 'cannibal' };
const executions = (s: ReturnType<typeof scene>) => s.state.events.filter((e) => e.kind === 'execution');
const virgin = (s: ReturnType<typeof scene>) => s.dayActions().filter((d) => d.roleId === 'virgin');

describe('Virgin', () => {
  it("a Townsfolk nominator is executed, as today's execution", () => {
    const s = scene(cast).start().dawn();
    expect(s.act('virgin', 'nominated', ['bo']).effective).toBe(true);
    // Chosen for execution, which happens as the night starts.
    expect(executions(s)).toMatchObject([{ playerId: 'bo', died: true }]);
    expect(s.alive('bo')).toBe(true);
    s.dusk();
    expect(s.alive('bo')).toBe(false);
    expect(s.g.player('bo' as never).life.cause).toBe('execution');
  });
  it('replaces an execution recorded earlier today, and the Cannibal eats the nominator at dusk', () => {
    const s = scene(cast).start().dawn().execute(null);
    s.act('virgin', 'nominated', ['bo']);
    expect(executions(s)).toMatchObject([{ playerId: 'bo' }]);
    s.dusk();
    const eaten = Object.values(s.state.abilities).filter(
      (a) => a.holder.kind === 'player' && a.holder.id === 'fi' && a.origin.kind !== 'character',
    );
    expect(eaten.map((a) => a.roleId)).toEqual([s.character('bo')]);
  });
  it('a nominator who is not a Townsfolk: nothing happens, and the use is spent', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('virgin', 'nominated', ['di']).effective).toBe(false);
    expect(s.alive('di')).toBe(true);
    expect(s.state.abilities[s.ability('virgin')]?.used).toBe(true);
    expect(virgin(s)[0]?.recorded).toEqual(['di']);
    s.dusk().dawn();
    expect(virgin(s)).toEqual([]);
  });
  it('an impaired Virgin spends the use for nothing', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['ann'] })
      .dawn();
    expect(s.act('virgin', 'nominated', ['bo']).summary).toBe('The Virgin is drunk or poisoned: nothing happens.');
    expect(s.alive('bo')).toBe(true);
    expect(s.state.abilities[s.ability('virgin')]?.used).toBe(true);
  });
  it('a second Use takes it back: the execution chosen before is restored', () => {
    const s = scene(cast).start().dawn().execute('di');
    s.act('virgin', 'nominated', ['bo']);
    expect(executions(s).at(-1)).toMatchObject({ playerId: 'bo', died: true });
    s.act('virgin', 'nominated', []);
    expect(executions(s).at(-1)).toMatchObject({ playerId: 'di', died: true });
    expect(virgin(s)[0]?.recorded).toBeNull();
    expect(s.state.abilities[s.ability('virgin')]?.used).toBe(false);
  });
  it('a preview changes nothing', () => {
    const s = scene(cast).start().dawn();
    s.act('virgin', 'nominated', ['bo'], { mode: 'preview' });
    expect(s.alive('bo')).toBe(true);
    expect(executions(s)).toEqual([]);
    expect(virgin(s)).toHaveLength(1);
  });
  it('the Storyteller can force either way', () => {
    const s = scene(cast).start().dawn();
    s.act('virgin', 'nominated', ['di'], { mode: 'force_success' });
    s.dusk();
    expect(s.alive('di')).toBe(false);
    const t = scene(cast).start().dawn();
    t.act('virgin', 'nominated', ['bo'], { mode: 'force_fail' });
    expect(t.alive('bo')).toBe(true);
    expect(executions(t)).toEqual([]);
  });
});
