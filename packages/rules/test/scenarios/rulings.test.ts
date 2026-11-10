// Single rulings the role tests leave out: the Gossip's timing, the Mathematician, pickers, the Gambler and the starpass.
import { describe, expect, it } from 'vitest';
import { as, shootAs } from './lib';
import { scene, ST, type Scene } from '../scenario';

describe('a Gossip killed before their slot kills nobody', () => {
  const statement = () => {
    const chars = {
      ann: 'gossip',
      bo: 'imp',
      cy: 'poisoner',
      di: 'empath',
      ed: 'butler',
      fi: 'virgin',
      gus: 'flowergirl',
    };
    const s = scene(chars).start().dawn();
    s.act('gossip', 'statement', ['true']);
    return s.dusk();
  };

  it('the Demon kills the Gossip that night: no kill and no decision', () => {
    const s = statement()
      .submit({ bo: ['ann'] })
      .review();
    expect(s.res.deaths).toEqual(['ann']);
    expect(s.hasDecision('gossip_victim')).toBe(false);
  });

  it('the Gossip alive at their slot kills as before', () => {
    const s = statement()
      .submit({ bo: ['di'] })
      .decide('gossip_victim', 'ed');
    expect(s.res.deaths).toEqual(['di', 'ed']);
  });
});

describe('the Mathematician', () => {
  const count = (s: Scene) => {
    s.review();
    return Number(s.row('ann').truth[0]?.split(' ')[0]);
  };

  describe('since dawn', () => {
    const chars = { ann: 'mathematician', bo: 'slayer', cy: 'poisoner', di: 'imp', ed: 'butler', fi: 'empath' };
    const poisoned = () =>
      scene(chars)
        .start()
        .submit({ cy: ['bo'] })
        .dawn();

    it('a poisoned Slayer who shoots by day is counted that night', () => {
      const s = poisoned();
      s.act('slayer', 'shoot', ['di']);
      s.dusk();
      expect(count(s)).toBe(1);
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

    it('a day event counts for that night only', () => {
      const s = poisoned();
      s.act('slayer', 'shoot', ['di']);
      s.dusk();
      expect(count(s)).toBe(1);
      s.nextNight();
      expect(count(s)).toBe(0);
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
      expect(s.res.malfunctions.map((m) => m.playerId).sort()).toEqual(['bo', 'di']);
    });

    it('the Godfather hidden Recluse counts the Godfather on night 0', () => {
      const chars = { bo: 'godfather', cy: 'recluse', ann: 'mathematician', di: 'imp', ed: 'empath', fi: 'butler' };
      const s = scene(chars, { fields: { godfather: { outsiders: '+1' } } })
        .start()
        .decide('godfather_recluse', 'hide');
      expect(count(s)).toBe(1);
      expect(s.res.malfunctions.map((m) => m.playerId)).toEqual(['bo']);
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
      expect(s.res.malfunctions).toMatchObject([{ playerId: 'cy', detail: `${name}'s ability yielded false info` }]);
      const line = s.row('cy');
      s.g.st({ type: 'override_result', resultKey: line.key, lines: line.truth });
      expect(count(s)).toBe(0);
    });

    it('a believed Sailor choice is counted, and the Storyteller can remove it', () => {
      const s = believing('sailor')
        .submit({ cy: ['ed'] })
        .review();
      expect(count(s)).toBe(1);
      expect(s.res.malfunctions).toMatchObject([{ playerId: 'cy', detail: `${name}'s ability failed` }]);
      s.g.st({ type: 'adjust_malfunctions', add: [], remove: [as('cy')] });
      expect(count(s)).toBe(0);
    });

    it('a declined choice is not counted', () => {
      const s = believing('seamstress').submit({ cy: [] }).review();
      expect(count(s)).toBe(0);
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

describe('alive-only pickers', () => {
  it.each(['sailor', 'devils_advocate', 'huntsman'])(
    '%s: a player dead at the start of the night is refused',
    (role) => {
      const chars = { ann: role, bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler', fi: 'damsel', gus: 'virgin' };
      const s = scene(chars).start();
      s.submit({ ann: role === 'huntsman' ? [] : ['ed'] }).dawn();
      s.g.st({ type: 'mark_alive', playerId: as('di'), alive: false });
      s.dusk();
      const spec = s.specs('ann').find((x) => x.roleId === role);
      expect(spec?.fields[0]?.options).not.toContain('di');
      expect(spec?.fields[0]?.options).toContain('fi');
      const actions = { [spec?.key as string]: { values: ['di'] } };
      expect(s.g.tryAs(as('ann'), { type: 'submit_night', actions }).ok).toBe(false);
      expect(s.g.tryAs(ST, { type: 'submit_for', playerId: as('ann'), actions }).ok).toBe(false);
    },
  );

  it('the Sailor may still choose themselves', () => {
    const s = scene({ ann: 'sailor', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' }).start();
    expect(s.specs('ann')[0]?.fields[0]?.options).toContain('ann');
  });

  it('night pickers for the Demon and Poisoner include dead players, and a dead target is no death', () => {
    const chars = { ann: 'imp', bo: 'poisoner', cy: 'empath', di: 'butler', ed: 'sailor', fi: 'clockmaker' };
    const s = scene(chars).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: as('cy'), alive: false });
    s.dusk();
    expect(s.specs('ann')[0]?.fields[0]?.options).toContain('cy');
    expect(s.specs('bo')[0]?.fields[0]?.options).toContain('cy');
    s.submit({ ann: ['cy'], bo: ['cy'] }).review();
    expect(s.res.deaths).toEqual([]);
    expect(s.res.log.join('\n')).toMatch(/already dead/);
  });
});

describe('the Gambler choosing themselves', () => {
  const night = (role: string, o?: Parameters<typeof scene>[1]) =>
    scene({ ann: role, bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' }, o).start().nextNight();

  it('is offered, and guessing their own role right does nothing', () => {
    const s = night('gambler');
    expect(s.specs('ann')[0]?.fields[0]?.options).toContain('ann');
    s.submit({ ann: ['ann', 'gambler'] }).review();
    expect(s.res.deaths).toEqual([]);
  });

  it('a Drunk who believes they are the Gambler guesses Gambler: wrong, and impaired means no death', () => {
    const s = night('drunk', { believed: { ann: 'gambler' } })
      .submit({ ann: ['ann', 'gambler'] })
      .review();
    expect(s.res.deaths).toEqual([]);
    expect(s.res.actors.find((a) => a.playerId === 'ann')?.outcome).toContain('impaired: does not die');
  });
});

describe('a starpass must pick a living Minion', () => {
  const chars = { ann: 'imp', bo: 'poisoner', cy: 'assassin', di: 'empath', ed: 'butler', fi: 'virgin', gus: 'oracle' };

  it('the options are exactly the living Minions, and the default becomes the Imp', () => {
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .review();
    const d = s.decision('starpass');
    expect(d.options.map((o) => o.id).sort()).toEqual(['bo', 'cy']);
    s.dawn();
    expect(s.character(d.default as string)).toBe('imp');
  });

  it('with no living Minion nobody becomes the Imp, and the row says so', () => {
    const s = scene({ ann: 'imp', bo: 'poisoner', cy: 'empath', di: 'butler', ed: 'virgin' }).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: as('bo'), alive: false });
    s.dusk()
      .submit({ ann: ['ann'] })
      .review();
    expect(s.hasDecision('starpass')).toBe(false);
    expect(s.res.actors.find((a) => a.playerId === 'ann')?.outcome).toContain('starpass: no living Minion');
    s.dawn();
    expect(Object.values(s.state.players).filter((p) => p.character === 'imp')).toHaveLength(1);
  });
});

describe('what players see and when', () => {
  const chars = { ann: 'imp', bo: 'poisoner', cy: 'empath', di: 'butler', ed: 'sailor', fi: 'clockmaker' };

  it('a day death shows to players the next morning; the Storyteller sees it at once', () => {
    const s = scene(chars).start().dawn().kill('di');
    expect(s.dead('di')).toBe(true);
    expect(s.g.view(as('cy')).deadAtDawn).toEqual([]);
    s.dusk()
      .submit({ ann: ['fi'] })
      .review();
    expect(s.g.view(as('cy')).deadAtDawn).toEqual([]);
    s.dawn();
    expect([...s.g.view(as('cy')).deadAtDawn].sort()).toEqual(['di', 'fi']);
  });

  it('each Minion learns the other Minions on night 0, not the Demon or the Marionette', () => {
    const c = {
      ann: 'imp',
      bo: 'marionette',
      cy: 'poisoner',
      di: 'scarlet_woman',
      ed: 'empath',
      fi: 'butler',
      gus: 'sailor',
    };
    const s = scene(c, { believed: { bo: 'seamstress' } }).start();
    const lines = s.g.view(as('cy')).me.messages.find((m) => m.title === 'Your fellow Minions')?.lines;
    expect(lines?.[0]).toBe('The other Minions are: di.');
    expect(JSON.stringify(s.g.view(as('cy')).me.messages)).not.toMatch(/marionette|ann/i);
    expect(s.g.view(as('bo')).me.messages).toEqual([]);
    expect(s.g.view(as('ann')).me.messages.map((m) => m.title)).toEqual(['Demon information']);
  });

  it('a lone Minion is told so', () => {
    const s = scene(chars).start();
    expect(s.g.view(as('bo')).me.messages[0]?.lines[0]).toBe('You are the only Minion.');
  });

  it('only a dead player can have their vote marked used, and a revive restores it', () => {
    const s = scene(chars).start().dawn();
    expect(s.g.tryAs(ST, { type: 'set_ghost_vote', playerId: as('cy'), used: true }).ok).toBe(false);
    expect(s.g.tryAs(as('cy'), { type: 'use_ghost_vote' }).ok).toBe(false);
    s.g.st({ type: 'mark_alive', playerId: as('cy'), alive: false });
    s.g.as(as('cy'), { type: 'use_ghost_vote' });
    expect(s.g.view(as('cy')).me.ghostVoteUsed).toBe(true);
    s.g.st({ type: 'set_ghost_vote', playerId: as('cy'), used: false });
    expect(s.g.view(as('cy')).me.ghostVoteUsed).toBe(false);
    s.g.st({ type: 'set_ghost_vote', playerId: as('cy'), used: true });
    s.g.st({ type: 'mark_alive', playerId: as('cy'), alive: true });
    expect(s.g.view(as('cy')).me.ghostVoteUsed).toBe(false);
  });

  it('the story records roles, impairment and targets per night, for the Storyteller only', () => {
    const c = { ann: 'imp', bo: 'poisoner', cy: 'empath', di: 'butler', ed: 'sailor' };
    const s = scene(c)
      .start()
      .submit({ bo: ['cy'], ed: ['ed'], di: ['ann'] })
      .dawn()
      .execute('di')
      .dusk();
    const story = JSON.stringify(s.g.grimoire().story);
    expect(story).toContain('cy');
    expect(story).toContain('di');
    expect(JSON.stringify(s.g.view(as('cy')))).not.toMatch(/"story"/);
  });

  it('play again, mid-game, keeps players, seats and the script and resets the rest', () => {
    const s = scene(chars).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: as('cy'), alive: false });
    s.g.st({ type: 'set_ghost_vote', playerId: as('cy'), used: true });
    const before = s.state;
    s.g.st({ type: 'play_again' });
    expect(s.state.phase.kind).toBe('setup');
    expect(s.state.storytellerId).toBe(before.storytellerId);
    expect(s.state.script).toEqual(before.script);
    expect(s.state.seats).toEqual(before.seats);
    for (const p of Object.values(s.state.players)) {
      expect(p).toMatchObject({ character: null, hasSeenRole: false, life: { alive: true, ghostVoteUsed: false } });
    }
    expect(s.state.conditions).toEqual([]);
    expect(s.g.view(as('cy')).me.messages).toEqual([]);
  });
});
