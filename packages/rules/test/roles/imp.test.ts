import type { RoleId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { TRAVELLER } from '../helpers/plain';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'imp', bo: 'm1', cy: 't1', di: 't2', ed: 'scarlet_woman', fi: 't3' };
describe('Imp', () => {
  it('kills from the first night after', () => {
    const s = scene(cast).start();
    expect(s.specs('ann')).toEqual([]);
    s.nextNight()
      .submit({ ann: ['cy'] })
      .dawn();
    expect(s.alive('cy')).toBe(false);
  });
  it('starpasses to the Scarlet Woman with 5 or more alive, with nothing to ask', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .review();
    expect(s.hasDecision('starpass')).toBe(false);
    expect(s.res.actors.find((a) => a.playerId === pid('ann'))?.outcome).toContain('ed becomes the Imp');
    expect(s.res.notices.filter((n) => n.title === 'You are now the Imp').map((n) => n.playerId)).toEqual([pid('ed')]);
    // The new Imp does not act that night.
    expect(s.res.deaths).toEqual([pid('ann')]);
    s.dawn();
    expect(s.character('ed')).toBe('imp');
    expect(s.alive('ann')).toBe(false);
    expect(s.inbox('ed')).toContain('You are now the Imp');
  });
  it('the Storyteller picks a living Minion when the Scarlet Woman is poisoned, and the new Imp is told', () => {
    const s = scene({ ...cast, bo: 'poisoner', fi: 'm2', gu: 't3' })
      .start()
      .dawn()
      .kill('fi')
      .dusk()
      .submit({ ann: ['ann'], bo: ['ed'] })
      .review();
    expect(s.decision('starpass').options.map((o) => o.id)).toEqual([pid('bo'), pid('ed')]);
    expect(s.decision('starpass').default).toBe(pid('ed'));
    s.decide('starpass', 'bo').dawn();
    expect(s.character('bo')).toBe('imp');
    expect(s.alignment('bo')).toBe('evil');
    expect(s.character('ed')).toBe('scarlet_woman');
    expect(s.inbox('bo')).toContain('You are now the Imp');
  });
  it('with no living Minion nobody becomes the Imp, and the row says so', () => {
    const s = scene(cast)
      .start()
      .dawn()
      .kill('bo')
      .kill('ed')
      .dusk()
      .submit({ ann: ['ann'] })
      .review();
    expect(s.hasDecision('starpass')).toBe(false);
    expect(s.res.actors.find((a) => a.playerId === pid('ann'))?.outcome).toContain('starpass: no living Minion');
    s.dawn();
    expect([...s.state.players.values()].filter((p) => p.character === 'imp')).toHaveLength(1);
  });
  it('a chosen player who is already dead is no death', () => {
    const s = scene(cast).start().dawn().kill('cy').dusk();
    expect(s.specs('ann')[0]?.fields[0]?.options).toContain(pid('cy'));
    s.submit({ ann: ['cy'] }).review();
    expect(s.res.deaths).toEqual([]);
    expect(s.res.log.join('\n')).toMatch(/already dead/);
  });
  it('the Storyteller picks with fewer than 5 alive', () => {
    const s = scene({ ann: 'imp', bo: 'm1', cy: 't1', ed: 'scarlet_woman' })
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .review();
    expect(s.decision('starpass')).toMatchObject({ default: pid('ed') });
    s.decide('starpass', 'bo').dawn();
    expect(s.character('bo')).toBe('imp');
  });
  it('a starpass pick is dropped when the Imp chooses someone else after all', () => {
    const s = scene({ ...cast, ed: 'm2' })
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .decide('starpass', 'bo');
    s.g.st({ type: 'reopen_collecting' });
    s.submit({ ann: ['cy'] }).review();
    expect(s.res.decisions).toEqual([]);
    s.g.st({ type: 'publish_dawn' });
    expect(s.character('bo')).not.toBe('imp');
    expect(s.alive('cy')).toBe(false);
  });
  describe('after a starpass', () => {
    const passed = () =>
      scene(cast)
        .start()
        .nextNight()
        .submit({ ann: ['ann'] })
        .dawn();
    it('the dead Imp stays an evil Imp and a Demon, and no longer wakes', () => {
      const s = passed();
      expect(s.g.grimoire().players.find((p) => p.id === pid('ann'))).toMatchObject({
        alive: false,
        character: 'imp',
        isDemon: true,
        alignment: 'evil',
      });
      s.dusk();
      expect(s.specs('ann')).toEqual([]);
      expect(s.specs('ed')).toHaveLength(1);
    });
    it('the game goes on until the new Imp dies', () => {
      const s = passed();
      expect(s.state.gameEnd).toEqual([]);
      s.kill('ed');
      expect(s.state.gameEnd.map((g) => g.key)).toEqual(['no_demon']);
    });
    it('the Storyteller can give the Imp to someone else by hand, though not twice among the living', () => {
      const s = passed();
      const give = (id: string, role: string) =>
        s.g.tryAs(pid('st'), { type: 'assign_character', playerId: pid(id), roleId: role as RoleId }).ok;
      expect(give('bo', 'imp')).toBe(false);
      expect(give('ed', 'scarlet_woman')).toBe(true);
      expect(give('bo', 'imp')).toBe(true);
      expect(s.character('bo')).toBe('imp');
    });
    it('an evil Traveller who joins is told only the living Imp', () => {
      const vi = pid('vi');
      const told = (s: ReturnType<typeof scene>) => {
        s.g.as(null, { type: 'join', id: vi, name: 'vi', rolePreference: 'none', wantsStoryteller: false });
        s.g.st({ type: 'add_traveller', playerId: vi, roleId: TRAVELLER[0] as RoleId, alignment: 'evil' });
        return s.inbox('vi');
      };
      expect(told(passed())).toContain('The Demon is: ed.');
      // None alive: the one who was.
      expect(told(scene(cast).start().dawn().kill('ann'))).toContain('The Demon is: ann.');
    });
  });
  it('no kill when poisoned', () => {
    const s = scene({ ...cast, bo: 'poisoner' })
      .start()
      .nextNight()
      .submit({ ann: ['cy'], bo: ['ann'] })
      .dawn();
    expect(s.alive('cy')).toBe(true);
  });
});
