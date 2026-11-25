import { describe, expect, it } from 'vitest';
import { as, shootAs } from '../helpers/scene';
import { pid } from '../helpers/game';
import { scene, type Scene } from '../scenario';

const cast = { ann: 'mathematician', bo: 'empath', cy: 'imp', di: 'poisoner', ed: 'butler' };
const count = (s: Scene) => {
  s.review();
  return Number(s.row('ann').truth[0]?.split(' ')[0]);
};

describe('Mathematician', () => {
  it('counts a player poisoned into false information, and the Storyteller can add to it', () => {
    const s = scene(cast).start();
    expect(s.truth('ann')).toEqual(["0 players' abilities worked abnormally."]);
    s.submit({ di: ['bo'] }).review();
    expect(s.truth('ann')).toEqual(["1 player's ability worked abnormally."]);
    s.g.st({ type: 'adjust_malfunctions', add: [as('ed')], remove: [] });
    expect(s.truth('ann')).toEqual(["2 players' abilities worked abnormally."]);
  });

  it('the false-value cap counts each player who could have malfunctioned', () => {
    const chars = { ann: 'mathematician', bo: 'oracle', cy: 'witch', di: 'godfather', ed: 'imp', fi: 'poisoner' };
    const s = scene(chars, { fields: { godfather: { outsiders: '+1' } } })
      .start()
      .submit({ fi: ['ann'], cy: ['bo'] });
    expect(s.row('ann').alternatives.length - 1).toBe(5);
  });

  describe('since dawn', () => {
    const chars = { ann: 'mathematician', bo: 'slayer', cy: 'poisoner', di: 'imp', ed: 'butler', fi: 'empath' };
    const poisoned = () =>
      scene(chars)
        .start()
        .submit({ cy: ['bo'] })
        .dawn();

    it('a poisoned Slayer who shoots by day is counted that night only', () => {
      const s = poisoned();
      s.act('slayer', 'shoot', ['di']);
      s.dusk();
      expect(count(s)).toBe(1);
      s.nextNight();
      expect(count(s)).toBe(0);
    });

    it('a shot that is only previewed is not counted', () => {
      const s = poisoned();
      s.act('slayer', 'shoot', ['di'], { mode: 'preview' });
      s.dusk();
      expect(count(s)).toBe(0);
    });

    it('a poisoned Tea Lady who fails to protect against a Slayer shot is counted', () => {
      const tea = {
        ann: 'mathematician',
        bo: 'tea_lady',
        cy: 'recluse',
        di: 'slayer',
        ed: 'poisoner',
        fi: 'imp',
        gus: 'butler',
      };
      const s = scene(tea)
        .start()
        .submit({ ed: ['bo'] })
        .dawn();
      shootAs(s, 'cy', 'demon');
      expect(s.alive('cy')).toBe(false);
      s.dusk();
      expect(count(s)).toBe(2);
    });
  });

  describe('the Recluse', () => {
    it('misleading the Empath and the Fortune Teller in one night counts 2, and not the Recluse', () => {
      const chars = {
        bo: 'empath',
        cy: 'recluse',
        di: 'fortune_teller',
        ann: 'mathematician',
        ed: 'imp',
        fi: 'poisoner',
        gus: 'butler',
      };
      const s = scene(chars, { fields: { fortune_teller: { herring: 'gus' } } })
        .start()
        .submit({ di: ['cy', 'gus'] })
        .review();
      for (const d of s.res.decisions.filter((x) => x.key.kind === 'registration')) {
        const lie = d.options.find((o) => o.id !== d.default);
        s.g.st({ type: 'decide', key: d.key, option: lie?.id as string });
      }
      expect(count(s)).toBe(2);
      expect(s.res.malfunctions.map((m) => m.playerId).sort()).toEqual([pid('bo'), pid('di')]);
    });

    it('the Godfather hidden Recluse counts the Godfather on night 0', () => {
      const chars = { bo: 'godfather', cy: 'recluse', ann: 'mathematician', di: 'imp', ed: 'empath', fi: 'butler' };
      const s = scene(chars, { fields: { godfather: { outsiders: '+1' } } })
        .start()
        .decide('godfather_recluse', 'hide');
      expect(count(s)).toBe(1);
      expect(s.res.malfunctions.map((m) => m.playerId)).toEqual([pid('bo')]);
    });
  });

  describe.each([
    ['drunk', 'Drunk'],
    ['marionette', 'Marionette'],
  ])('Jinx (Mathematician & %s)', (role, name) => {
    const believing = (believed: string) =>
      scene(
        { di: 'imp', cy: role, ann: 'mathematician', bo: 'poisoner', ed: 'butler', fi: 'virgin' },
        { believed: { cy: believed } },
      ).start();

    it('false information is counted, unless the truth is sent', () => {
      const s = believing('empath').review();
      expect(count(s)).toBe(1);
      expect(s.res.malfunctions).toMatchObject([
        { playerId: pid('cy'), detail: `${name}'s ability yielded false info` },
      ]);
      const line = s.row('cy');
      s.g.st({ type: 'override_result', resultKey: line.key, lines: line.truth });
      expect(count(s)).toBe(0);
    });

    it('a believed choice is counted, a declined one is not, and the Storyteller can remove it', () => {
      const s = believing('sailor')
        .submit({ cy: ['ed'] })
        .review();
      expect(count(s)).toBe(1);
      expect(s.res.malfunctions).toMatchObject([{ playerId: pid('cy'), detail: `${name}'s ability failed` }]);
      s.g.st({ type: 'adjust_malfunctions', add: [], remove: [as('cy')] });
      expect(count(s)).toBe(0);
      expect(count(believing('seamstress').submit({ cy: [] }))).toBe(0);
    });

    it('the false-value cap includes them only when the believed role has a night ability', () => {
      const options = (believed: string) =>
        believing(believed)
          .submit({ bo: ['ann'] })
          .review()
          .row('ann').alternatives.length;
      expect(options('empath')).toBe(options('mayor') + 1);
    });
  });
});
