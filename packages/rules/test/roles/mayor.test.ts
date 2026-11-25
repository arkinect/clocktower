import { describe, expect, it } from 'vitest';
import { TRAVELLER } from '../helpers/plain';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'mayor', bo: 't1', cy: 'imp', di: 't2', ed: 'm1' };
describe('Mayor', () => {
  it('the Storyteller can bounce a night kill', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .decide('mayor', 'bo')
      .dawn();
    expect(s.alive('ann')).toBe(true);
    expect(s.alive('bo')).toBe(false);
  });
  it('or let the Mayor die', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .decide('mayor', 'die')
      .dawn();
    expect(s.alive('ann')).toBe(false);
  });
  it('or save everyone', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .decide('mayor', 'none')
      .dawn();
    expect(s.alive('ann')).toBe(true);
  });
  it('a bounce goes through other protections', () => {
    const s = scene({ ...cast, bo: 'fool' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .decide('mayor', 'bo')
      .dawn();
    expect(s.alive('bo')).toBe(true);
    expect(s.alive('ann')).toBe(true);
  });
  it('even an Assassin can be bounced', () => {
    const s = scene({ ...cast, ed: 'assassin' })
      .start()
      .nextNight()
      .submit({ ed: ['ann'] })
      .decide('mayor', 'bo')
      .dawn();
    expect(s.alive('bo')).toBe(false);
  });
  it.each([
    ['nobody else', {}],
    ['a Traveller, who does not count', { vi: TRAVELLER[0] as string }],
  ])('wins with 3 alive and no execution: 3 and %s', (_name, extra) => {
    const s = scene({ ...cast, ...extra })
      .start()
      .dawn();
    s.execute('bo').dusk().dawn().kill('ed');
    s.execute(null).dusk();
    // The win is stored, and the night starts all the same.
    expect(s.state.phase.kind).toBe('night');
    expect(s.winners()).toContain('good');
  });
  it('not with an attack on someone else', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ cy: ['bo'] })
      .review();
    expect(s.hasDecision('mayor')).toBe(false);
    expect(s.res.deaths).toEqual([pid('bo')]);
  });
  it('not with a day kill', () => {
    const s = scene({ ...cast, bo: 'slayer' })
      .start()
      .dawn();
    s.act('slayer', 'shoot', ['ann'], { mode: 'force_success' });
    expect(s.alive('ann')).toBe(false);
  });
  it('a random bounce is recommended, and may land on a protected player', () => {
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const s = scene({ ...cast, di: 'innkeeper', ed: 'empath', fi: 't3' })
        .start()
        .dawn();
      s.g.seed = seed * 31;
      s.dusk()
        .submit({ cy: ['ann'], di: ['bo', 'ed'] })
        .review();
      if (s.decision('mayor').default === 'die') continue;
      found = true;
      s.decide('mayor', 'bo');
      expect(s.res.deaths).toEqual([]);
      s.decide('mayor', 'die');
      expect(s.res.deaths).toEqual([pid('ann')]);
    }
    expect(found).toBe(true);
  });
});
