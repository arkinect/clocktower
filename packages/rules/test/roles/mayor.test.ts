import { describe, expect, it } from 'vitest';
import { TRAVELLER } from '../helpers/plain';
import { scene } from '../scenario';

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
  it('wins with 3 alive and no execution', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo').dusk().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'ed' as never, alive: false });
    s.execute(null).dusk();
    expect(s.winners()).toContain('good');
  });
  it('does not count Travellers: 3 residents and a Traveller alive still wins', () => {
    const s = scene({ ...cast, vi: TRAVELLER[0] as string })
      .start()
      .dawn();
    s.execute('bo').dusk().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'ed' as never, alive: false });
    s.execute(null).dusk();
    expect(s.alive('vi')).toBe(true);
    expect(s.winners()).toContain('good');
  });
  it('not with a day kill', () => {
    const s = scene({ ...cast, bo: 'slayer' })
      .start()
      .dawn();
    s.act('slayer', 'shoot', ['ann'], { mode: 'force_success' });
    expect(s.state.prompts).toEqual([]);
    expect(s.alive('ann')).toBe(false);
  });
});
