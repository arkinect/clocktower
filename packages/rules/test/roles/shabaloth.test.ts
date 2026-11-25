import { describe, expect, it } from 'vitest';
import { pid } from '../helpers/game';
import { scene } from '../scenario';

const cast = { ann: 'shabaloth', bo: 't1', cy: 't2', di: 't3', ed: 't4', fi: 't5', gu: 'm1', hal: 't6', ivy: 't7' };
describe('Shabaloth', () => {
  it('kills two a night, and can bring back any earlier victim', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'cy'] })
      .dawn();
    expect(s.dead('bo', 'cy')).toBe(true);
    s.dusk()
      .submit({ ann: ['di', 'ed'] })
      .decide('shabaloth', 'none')
      .nextNight()
      .submit({ ann: ['fi', 'hal'] })
      .review();
    const offered = s.decision('shabaloth').options.map((o) => o.id);
    expect(offered.sort()).toEqual([...['bo', 'cy', 'di', 'ed'].map(pid), 'none'].sort());
    s.decide('shabaloth', 'cy');
    expect(s.res.revived).toEqual([pid('cy')]);
    s.dawn();
    expect(s.alive('cy')).toBe(true);
    expect(s.alive('bo')).toBe(false);
  });
});
