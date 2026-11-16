import { describe, expect, it } from 'vitest';
import { as, open } from './lib';
import { ST } from '../scenario';
import { scene } from '../scenario';

// The Review tab shows only drunk or poisoned players' results. Everyone else's follows from the night as decided
// there, and nothing reaches a player until dawn is published.
describe('Review and dawn', () => {
  it("a sober player's hidden result follows the Storyteller's choices on the Review tab", () => {
    const s = scene({ ann: 'empath', bo: 'recluse', cy: 'imp', di: 'poisoner', ed: 'butler' })
      .start()
      .submit({ di: ['ed'] })
      .review();
    expect(s.row('ann').impaired).toBe(false);
    expect(s.final('ann').join(' ')).toMatch(/\b0\b/);
    s.decide('registration', 'demon');
    expect(s.final('ann').join(' ')).toMatch(/\b1\b/);
    s.dawn();
    expect(s.inbox('ann').join(' ')).toMatch(/\b1\b/);
  });

  it('nothing reaches a player before dawn: results or notices', () => {
    const s = scene(
      { ann: 'mezepheles', bo: 'empath', cy: 'imp', di: 't1', ed: 't2' },
      {
        fields: { mezepheles: { word: 'apple' } },
      },
    )
      .start()
      .dawn();
    s.act('mezepheles', 'sayer', ['bo']);
    s.dusk().review();
    const before = s.inbox('bo').length;
    expect(s.inbox('bo')).not.toContain('You are now evil.');
    s.dawn();
    expect(s.inbox('bo')).toContain('You are now evil.');
    expect(s.inbox('bo').length).toBeGreaterThan(before);
  });

  it('a Scarlet Woman who takes over at night sees her new character only at dawn', () => {
    const s = scene({ ann: 'imp', bo: 'scarlet_woman', cy: 'assassin', di: 't1', ed: 't2', fi: 't3' })
      .start()
      .nextNight()
      .submit({ cy: ['ann'] })
      .review();
    const card = () => s.g.view(as('bo')).me.role?.roleId;
    expect(card()).toBe('scarlet_woman');
    expect(s.inbox('bo').join(' ')).not.toMatch(/Imp/);
    s.dawn();
    expect(card()).toBe('imp');
  });

  // The Storyteller may change any player's choice on the Review tab. The night resolves again from it.
  describe("changing a player's choice in review", () => {
    const night = () =>
      scene({ ann: 'imp', bo: 'ravenkeeper', cy: 'poisoner', di: 'empath', ed: 'butler' })
        .start()
        .nextNight()
        .submit({ ann: ['bo'] })
        .review();
    const kill = (s: ReturnType<typeof night>, target: string) =>
      s.g.tryAs(ST, {
        type: 'submit_for',
        playerId: as('ann'),
        actions: { [s.ability('imp')]: { values: [target] } },
      });

    it('what followed from the old choice goes, and what follows the new one comes', () => {
      const s = night();
      expect(s.res.deaths).toEqual(['bo']);
      expect(open(s).map((q) => q.playerId)).toEqual(['bo']);
      expect(kill(s, 'di').ok).toBe(true);
      expect(s.res.deaths).toEqual(['di']);
      expect(s.res.questions).toEqual([]);
      expect(kill(s, 'bo').ok).toBe(true);
      expect(open(s).map((q) => q.playerId)).toEqual(['bo']);
    });

    it('the changed choice is what dawn publishes', () => {
      const s = night();
      kill(s, 'di');
      s.dawn();
      expect(s.alive('bo')).toBe(true);
      expect(s.dead('di')).toBe(true);
    });

    it('a choice the picker never offered is still refused', () => {
      const s = night();
      expect(kill(s, 'nobody').ok).toBe(false);
      expect(s.res.deaths).toEqual(['bo']);
    });
  });

  // A fact is what the engine holds true, apart from what a player is told. The Review tab records it again.
  describe('changing a day fact in review', () => {
    const fact = (s: ReturnType<typeof scene>, role: string, action: string, values: string[]) =>
      s.g.tryAs(ST, { type: 'record_fact', abilityId: s.ability(role), action, values });
    const facts = (s: ReturnType<typeof scene>) => s.g.grimoire().review?.facts ?? [];

    it('the Flowergirl: the truth changes, and a written answer is marked as written against the old one', () => {
      const s = scene({ ann: 'flowergirl', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' })
        .start()
        .nextNight()
        .review();
      expect(facts(s).map((f) => [f.action, f.recorded])).toEqual([['demon_voted', ['no']]]);
      expect(s.truth('ann').join(' ')).toMatch(/did not vote/);
      s.g.st({ type: 'override_result', resultKey: s.row('ann').key, lines: ['No.'] });
      expect(fact(s, 'flowergirl', 'demon_voted', ['yes']).ok).toBe(true);
      expect(facts(s)[0]?.recorded).toEqual(['yes']);
      expect(s.truth('ann').join(' ')).toMatch(/a Demon voted/);
      expect(s.row('ann').staleOverride).toBe(true);
      expect(s.final('ann')).toEqual(['No.']);
    });

    it('the Gossip: a statement made true wakes them and someone dies; made false again, nobody does', () => {
      const s = scene({ ann: 'gossip', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' })
        .start()
        .nextNight()
        .review();
      expect(s.hasDecision('gossip_victim')).toBe(false);
      fact(s, 'gossip', 'statement', ['true']);
      expect(s.hasDecision('gossip_victim')).toBe(true);
      expect(s.res.deaths).toHaveLength(1);
      fact(s, 'gossip', 'statement', ['false']);
      expect(s.hasDecision('gossip_victim')).toBe(false);
      expect(s.res.deaths).toEqual([]);
    });

    it('the Mezepheles: who said the word can be set and taken back', () => {
      const s = scene(
        { ann: 'mezepheles', bo: 'empath', cy: 'imp', di: 't1', ed: 't2' },
        { fields: { mezepheles: { word: 'apple' } } },
      )
        .start()
        .nextNight()
        .review();
      fact(s, 'mezepheles', 'sayer', ['bo']);
      expect(s.res.after.players['bo']?.alignment).toBe('evil');
      fact(s, 'mezepheles', 'sayer', []);
      expect(s.res.after.players['bo']?.alignment).toBe('good');
    });

    it('the Juggler: the guesses are their own night choice, which Review can change, and the count follows', () => {
      const s = scene({ ann: 'juggler', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' }).start().dawn();
      s.act('juggler', 'juggled', ['yes']);
      s.dusk()
        .submit({ ann: ['bo', 'empath'] })
        .review();
      expect(s.truth('ann').join(' ')).toMatch(/\b0\b/);
      expect(facts(s).filter((f) => f.roleId === 'juggler')).toEqual([]);
      const guesses = (values: string[]) =>
        s.g.tryAs(ST, { type: 'submit_for', playerId: as('ann'), actions: { [s.ability('juggler')]: { values } } });
      expect(guesses(['bo', 'imp', 'di', 'empath']).ok).toBe(true);
      expect(s.truth('ann').join(' ')).toMatch(/\b2\b/);
    });

    it('the Moonchild: the chosen player can be changed, and back to no one', () => {
      const s = scene({ ann: 'moonchild', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' })
        .start()
        .nextNight()
        .submit({ bo: ['ann'] })
        .dawn();
      s.dusk().review();
      expect(s.res.deaths).toEqual([]);
      expect(fact(s, 'moonchild', 'target', ['di']).ok).toBe(true);
      expect(s.res.deaths).toEqual(['di']);
      fact(s, 'moonchild', 'target', ['none']);
      expect(s.res.deaths).toEqual([]);
    });

    it('the first night has no day before it, so no facts', () => {
      const s = scene(
        { ann: 'mezepheles', bo: 'flowergirl', cy: 'imp', di: 't1', ed: 't2' },
        { fields: { mezepheles: { word: 'apple' } } },
      )
        .start()
        .review();
      expect(facts(s)).toEqual([]);
      expect(fact(s, 'mezepheles', 'sayer', ['bo']).ok).toBe(false);
      expect(fact(s, 'flowergirl', 'demon_voted', ['yes']).ok).toBe(false);
    });

    it('only in review, only a fact tonight reads, and only a value the day would take', () => {
      const s = scene({ ann: 'flowergirl', bo: 'imp', cy: 'slayer', di: 'empath', ed: 'butler' }).start().nextNight();
      expect(fact(s, 'flowergirl', 'demon_voted', ['yes']).ok).toBe(false);
      s.review();
      expect(fact(s, 'slayer', 'shoot', ['bo']).ok).toBe(false);
      expect(fact(s, 'flowergirl', 'demon_voted', ['maybe']).ok).toBe(false);
      expect(s.alive('bo')).toBe(true);
    });
  });
});
