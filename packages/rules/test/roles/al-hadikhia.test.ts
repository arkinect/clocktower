import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'al_hadikhia', bo: 't1', cy: 't2', di: 't3', ed: 't4', fi: 'm1' };
const night = () =>
  scene(cast)
    .start()
    .nextNight()
    .submit({ ann: ['bo', 'cy', 'di'] })
    .review();
describe('Al-Hadikhia', () => {
  it('announces the choice to everyone at dawn', () => {
    const s = night();
    s.answer('bo', ['die']).answer('cy', ['die']).answer('di', ['die']).dawn();
    expect(s.inbox('fi')).toContain('The Al-Hadikhia chose bo, cy and di.');
  });
  it('each chooses; dying is honoured', () => {
    const s = night();
    s.answer('bo', ['die']).answer('cy', ['live']).answer('di', ['live']).dawn();
    expect(s.alive('bo')).toBe(false);
    expect(s.alive('cy')).toBe(true);
  });
  it('all live means all die', () => {
    const s = night();
    s.answer('bo', ['live']).answer('cy', ['live']).answer('di', ['live']).dawn();
    expect(s.dead('bo', 'cy', 'di')).toBe(true);
  });
  it('choosing to live revives a dead player', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo')
      .dusk()
      .submit({ ann: ['bo', 'cy', 'di'] })
      .review();
    s.answer('bo', ['live']).answer('cy', ['die']).answer('di', ['live']).dawn();
    expect(s.alive('bo')).toBe(true);
    expect(s.alive('cy')).toBe(false);
  });
  it('each question shows only the picks before it', () => {
    const qs = night().res.questions;
    expect(qs.map((q) => q.spec.prompt)).toEqual([
      'The Al-Hadikhia chose you. Do you choose to live or die?',
      'The Al-Hadikhia chose bo, then you. Do you choose to live or die?',
      'The Al-Hadikhia chose bo, cy, then you. Do you choose to live or die?',
    ]);
  });
  it('declining does nothing', () => {
    const s = scene(cast).start().nextNight().submit({ ann: [] }).dawn();
    expect(s.alive('bo')).toBe(true);
  });
  it('impaired: the answers have no effect', () => {
    const s = scene({ ...cast, fi: 'poisoner' })
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'cy', 'di'], fi: ['ann'] })
      .review();
    s.answer('bo', ['die']).answer('cy', ['die']).answer('di', ['die']).dawn();
    expect(s.alive('bo')).toBe(true);
  });
});
