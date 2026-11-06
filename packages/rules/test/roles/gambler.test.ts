import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'gambler', bo: 'empath', cy: 'd1', di: 't2', ed: 't3' };
describe('Gambler', () => {
  it('lives on a right guess', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'empath'] })
      .dawn();
    expect(s.alive('ann')).toBe(true);
  });
  it('dies on a wrong guess', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'oracle'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
    expect(s.g.player('ann' as never).life.cause).toBe('self_gamble');
  });
  it('a poisoned Gambler survives a wrong guess', () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .nextNight();
    s.submit({ ann: ['di', 'oracle'], bo: ['ann'] }).dawn();
    expect(s.alive('ann')).toBe(true);
  });
});
