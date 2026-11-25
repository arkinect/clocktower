import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'psychopath', bo: 't1', cy: 'imp', di: 't2', ed: 't3', fi: 't4' };
const psycho = (s: ReturnType<typeof scene>) => s.dayActions().filter((d) => d.roleId === 'psychopath');

describe('Psychopath', () => {
  it('kills the player they choose, once every day', () => {
    const s = scene(cast).start().dawn();
    expect(s.act('psychopath', 'kill', ['bo']).effective).toBe(true);
    expect(s.alive('bo')).toBe(false);
    // The dead player is still listed, until the day ends.
    expect(psycho(s)[0]?.fields[0]?.options).toContain(pid('bo'));
    s.dusk().dawn();
    expect(psycho(s)).toHaveLength(1);
    expect(psycho(s)[0]?.fields[0]?.options).not.toContain(pid('bo'));
    expect(s.act('psychopath', 'kill', ['di']).effective).toBe(true);
  });
});
