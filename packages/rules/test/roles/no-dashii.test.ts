import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'clockmaker', bo: 'empath', cy: 'butler', di: 'no_dashii', ed: 'poisoner', fi: 'sailor' };
describe('No Dashii', () => {
  it('poisons the closest Townsfolk each way, alive or dead, past Outsiders and Minions', () => {
    const s = scene(cast).start();
    const poisoned = () => Object.keys(cast).filter((id) => s.impaired(id));
    expect(poisoned()).toEqual(['bo', 'fi']);
    s.dawn().kill('bo');
    expect(poisoned()).toEqual(['bo', 'fi']);
  });
  it('the poison ends with the No Dashii', () => {
    const s = scene(cast).start().dawn();
    s.execute('di').dusk();
    expect(s.impaired('bo')).toBe(false);
  });
});
