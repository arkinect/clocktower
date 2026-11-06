import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'mathematician', bo: 'empath', cy: 'imp', di: 'poisoner', ed: 't2' };
describe('Mathematician', () => {
  it('counts nobody on a clean night', () => {
    const s = scene({ ...cast, di: 'm1' }).start();
    expect(s.truth('ann')).toEqual(["0 players' abilities worked abnormally."]);
  });
  it('counts a player poisoned into false info', () => {
    const s = scene(cast)
      .start()
      .submit({ di: ['bo'] });
    expect(s.truth('ann')).toEqual(["1 player's ability worked abnormally."]);
  });
  it('the Storyteller can add to the count', () => {
    const s = scene(cast)
      .start()
      .submit({ di: ['ed'] })
      .review();
    expect(s.truth('ann')).toEqual(["0 players' abilities worked abnormally."]);
  });
  it('sees false info if the Drunk ability yields it (the jinx)', () => {
    const s = scene({ ...cast, di: 'm1', ed: 'drunk' }, { believed: { ed: 'oracle' } })
      .start()
      .nextNight();
    s.g.st({ type: 'close_collecting', force: true });
    expect(s.res.results.find((r) => r.playerId === 'ann')).toBeTruthy();
  });
  it('offers every plausible count', () => {
    const s = scene(cast)
      .start()
      .submit({ di: ['bo'] });
    expect(s.row('ann').alternatives.length).toBeGreaterThanOrEqual(2);
  });
});
