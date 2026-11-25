import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'professor', bo: 'empath', cy: 'imp', di: 'm1', ed: 'recluse' };
describe('Professor', () => {
  it('resurrects a dead Townsfolk', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo')
      .dusk()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.alive('bo')).toBe(true);
  });
  it('who they bring back is alive as if they had never died', () => {
    const s = scene(cast).start().dawn().execute('bo').dusk();
    s.g.st({ type: 'set_ghost_vote', playerId: pid('bo'), used: true });
    s.submit({ ann: ['bo'] }).dawn();
    expect(s.g.player(pid('bo')).life).toMatchObject({ alive: true, diedAt: null, ghostVoteUsed: false });
  });
  it('a Drunk who thinks they are a Townsfolk stays dead', () => {
    const s = scene({ ...cast, bo: 'drunk' }, { believed: { bo: 'empath' } })
      .start()
      .dawn();
    s.execute('bo')
      .dusk()
      .submit({ ann: ['bo'] })
      .review();
    expect(s.res.revived).toEqual([]);
  });
  it('an Outsider stays dead and the use is spent', () => {
    const s = scene(cast).start().dawn();
    s.execute('ed')
      .dusk()
      .submit({ ann: ['ed'] })
      .dawn();
    expect(s.alive('ed')).toBe(false);
    s.execute('bo').dusk();
    expect(s.specs('ann')).toEqual([]);
  });
  it('picks only from those dead before tonight', () => {
    const s = scene(cast).start().dawn();
    s.execute('bo')
      .dusk()
      .submit({ cy: ['ed'] });
    expect(s.specs('ann')[0]?.fields[0]?.options).toEqual([pid('bo')]);
  });
});
