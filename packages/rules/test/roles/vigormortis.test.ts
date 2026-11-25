import { describe, expect, it } from 'vitest';
import { pid } from '../helpers/game';
import { scene } from '../scenario';

const cast = { ann: 'vigormortis', bo: 'empath', cy: 'poisoner', di: 'oracle', ed: 't3', fi: 't4', gu: 't5' };
describe('Vigormortis', () => {
  it('removes an Outsider at setup', () => {
    expect(scene(cast).g.grimoire().setup.counts.target[1]).toBe(0);
  });
  it('a killed Minion keeps their ability and poisons a Townsfolk neighbour', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['cy'], cy: ['ed'] })
      .decide('vigormortis', 'bo')
      .dawn();
    expect(s.alive('cy')).toBe(false);
    expect(s.impaired('bo')).toBe(true);
    s.dusk();
    expect(s.specs('cy')).toHaveLength(1);
  });
  it('the poison ends with the Vigormortis', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['cy'], cy: ['ed'] })
      .decide('vigormortis', 'bo')
      .dawn();
    s.execute('ann').dusk();
    expect(s.impaired('bo')).toBe(false);
  });
  it('a killed Townsfolk gets nothing', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.alive('bo')).toBe(false);
    expect(s.state.conditions.filter((c) => c.type === 'poisoned')).toEqual([]);
  });
  it('ruling: the Scarlet Woman who takes over keeps the last poison and the kept ability', () => {
    const s = scene({ ...cast, di: 'scarlet_woman' })
      .start()
      .nextNight();
    s.submit({ ann: ['cy'], cy: ['ed'] })
      .decide('vigormortis', 'bo')
      .dawn();
    expect(s.impaired('bo')).toBe(true);
    s.execute('ann').dusk();
    expect(s.character('di')).toBe('vigormortis');
    expect(s.impaired('bo')).toBe(true);
    expect(s.specs('cy')).toHaveLength(1);
  });
  it('the poisoned neighbour is either closest Townsfolk, alive or dead', () => {
    const s = scene({ ann: 'vigormortis', bo: 'empath', cy: 'poisoner', di: 'butler', ed: 'sailor', fi: 'oracle' })
      .start()
      .dawn()
      .kill('bo')
      .dusk()
      .submit({ ann: ['cy'] })
      .review();
    expect(s.decision('vigormortis').options.map((o) => o.id)).toEqual([pid('bo'), pid('ed')]);
  });
});
