import { describe, expect, it } from 'vitest';
import { pid } from '../helpers/game';
import { scene } from '../scenario';

const cast = {
  ann: 'pukka',
  bo: 'scarlet_woman',
  cy: 'empath',
  di: 'butler',
  ed: 'virgin',
  fi: 'oracle',
  gus: 'poisoner',
};
const poisoned = () =>
  scene(cast)
    .start()
    .submit({ ann: ['cy'] })
    .dawn();

describe('Pukka', () => {
  it('poisons, then kills the night after and the player is healthy', () => {
    const s = poisoned();
    expect(s.impaired('cy')).toBe(true);
    expect(s.alive('cy')).toBe(true);
    s.dusk()
      .submit({ ann: ['di'] })
      .dawn();
    expect(s.alive('cy')).toBe(false);
    expect(s.impaired('di')).toBe(true);
    expect(s.impaired('cy')).toBe(false);
  });

  it('kills the previous target even while impaired, but poisons nobody new', () => {
    const s = poisoned()
      .dusk()
      .submit({ ann: ['di'], gus: ['ann'] })
      .review();
    expect(s.res.deaths).toEqual([pid('cy')]);
    s.dawn();
    expect(s.impaired('di')).toBe(false);
  });

  it('executed: the poison outlasts the day, ends at their slot, and the target does not die', () => {
    // The Scarlet Woman is poisoned at dusk, so she doesn't take over.
    const s = poisoned().execute('ann');
    s.g.st({ type: 'add_condition', target: pid('bo') as never, condition: 'poisoned' });
    expect(s.impaired('cy')).toBe(true);
    s.dusk().review();
    expect(s.res.deaths).toEqual([]);
    s.dawn();
    expect(s.impaired('cy')).toBe(false);
  });

  it('the Scarlet Woman becomes the Pukka: her first choice does not kill the old victim', () => {
    const s = poisoned()
      .execute('ann')
      .dusk()
      .submit({ bo: ['di'] })
      .review();
    expect(s.res.deaths).toEqual([]);
    s.dawn();
    expect(s.alive('cy')).toBe(true);
    expect(s.impaired('cy')).toBe(false);
    expect(s.impaired('di')).toBe(true);
  });
});
