import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

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
    expect(s.g.player(pid('ann') as never).life.cause).toBe('self_gamble');
  });
  it('a poisoned Gambler survives a wrong guess', () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .nextNight();
    s.submit({ ann: ['di', 'oracle'], bo: ['ann'] }).dawn();
    expect(s.alive('ann')).toBe(true);
  });
  it('can choose themselves, and guessing their own role right does nothing', () => {
    const s = scene(cast).start().nextNight();
    expect(s.specs('ann')[0]?.fields[0]?.options).toContain(pid('ann'));
    s.submit({ ann: ['ann', 'gambler'] }).review();
    expect(s.res.deaths).toEqual([]);
  });
  it('a Drunk who believes they are the Gambler guesses Gambler: wrong, and impaired means no death', () => {
    const s = scene({ ...cast, ann: 'drunk' }, { believed: { ann: 'gambler' } })
      .start()
      .nextNight()
      .submit({ ann: ['ann', 'gambler'] })
      .review();
    expect(s.res.deaths).toEqual([]);
    expect(s.res.actors.find((a) => a.playerId === pid('ann'))?.outcome).toContain('impaired: does not die');
  });
});
