// Worked examples, one character or interaction each, that the role tests do not reach.
import { describe, expect, it } from 'vitest';
import { as, chosen, row, titles } from './lib';
import { scene, ST, type Scene } from '../scenario';

const result = (s: Scene, id: string) => s.res.results.find((r) => r.playerId === id);

describe('information', () => {
  it('poison makes false information, and the player cannot tell', () => {
    const chars = { ann: 'empath', bo: 'imp', cy: 'poisoner', di: 'clockmaker', ed: 't1', fi: 'mayor', gus: 'butler' };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ cy: ['ann'], bo: ['fi'] })
      .decide('mayor', 'die');
    const r = s.row('ann');
    expect(r.truth[0]).toMatch(/^1 /);
    expect(r.impaired).toBe(true);
    expect(r.causes.join(' ')).toMatch(/Poisoner/);
    expect(r.suggested[0]).toMatch(/^(0|2) /);
    expect(r.final).toEqual(r.suggested);
    s.dawn();
    const view = s.g.view(as('ann'));
    expect(view.me.messages.filter((m) => m.title === 'Empath').at(-1)?.lines).toEqual(r.suggested);
    expect(JSON.stringify(view)).not.toMatch(/impaired|causes|poisoned/i);
  });

  it('an Empath counts alive neighbours, skipping the dead', () => {
    const s = scene({ ann: 'empath', bo: 'butler', cy: 'imp', di: 'sailor', ed: 'clockmaker', fi: 'poisoner' }).start();
    expect(s.truth('ann')[0]).toMatch(/^1 /);
    s.dawn();
    s.g.st({ type: 'mark_alive', playerId: as('bo'), alive: false });
    s.dusk().submit({ cy: ['ed'] });
    expect(s.truth('ann')[0]).toMatch(/^2 /);
  });

  it('a Fortune Teller: the red herring reads yes, and impaired gives the opposite', () => {
    const chars = { ann: 'fortune_teller', bo: 'empath', cy: 'butler', di: 'imp', ed: 'poisoner', fi: 'sailor' };
    const fields = { fortune_teller: { herring: 'bo' } };
    const s = scene(chars, { fields })
      .start()
      .submit({ ann: ['bo', 'cy'] });
    expect(s.truth('ann')[0]).toMatch(/Yes/);
    const t = scene(chars, { fields })
      .start()
      .submit({ ann: ['fi', 'cy'], ed: ['ann'] });
    expect(t.truth('ann')[0]).toMatch(/No/);
    expect(t.row('ann').suggested[0]).toMatch(/Yes/);
  });

  it('a Seamstress asks once, and cannot pick themselves', () => {
    const chars = { ann: 'seamstress', bo: 'empath', cy: 'imp', di: 'butler', ed: 'poisoner' };
    const s = scene(chars).start();
    const key = s.specs('ann')[0]?.key as string;
    expect(s.g.tryAs(as('ann'), { type: 'submit_night', actions: { [key]: { values: ['ann', 'cy'] } } }).ok).toBe(
      false,
    );
    s.submit({ ann: ['bo', 'cy'] });
    expect(s.truth('ann')[0]).toMatch(/different/);
    s.nextNight();
    expect(s.specs('ann')).toEqual([]);
  });

  it('a Clockmaker with the Demon three seats from the Minion hears 3, and impaired stays in range and differs', () => {
    const chars = {
      ann: 'imp',
      bo: 'clockmaker',
      cy: 'empath',
      di: 'butler',
      ed: 'poisoner',
      fi: 'sailor',
      gus: 'mayor',
    };
    expect(scene(chars).start().truth('bo')[0]).toMatch(/is 3 steps/);
    const line = scene(chars)
      .start()
      .submit({ ed: ['bo'] })
      .row('bo').suggested[0] as string;
    const n = Number(/is (\d+)/.exec(line)?.[1]);
    expect(n).not.toBe(3);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  });

  it('a Flowergirl and a Juggler read the Day panel, and the Juggler only once', () => {
    const chars = { ann: 'flowergirl', bo: 'juggler', cy: 'imp', di: 'butler', ed: 'poisoner', fi: 'sailor' };
    const s = scene(chars).start().dawn();
    s.act('flowergirl', 'demon_voted', ['yes']);
    s.act('juggler', 'guesses', ['cy', 'imp', 'di', 'butler', 'ed', 'poisoner', 'fi', 'imp']);
    s.dusk();
    expect(s.truth('ann')[0]).toMatch(/^Yes/);
    expect(s.truth('bo')[0]).toMatch(/3 correctly/);
    s.nextNight();
    expect(result(s, 'bo')).toBeUndefined();
  });

  it('a Balloonist only ever shows a name, and a new type each night', () => {
    const chars = { ann: 'balloonist', bo: 'empath', cy: 'butler', di: 'imp', ed: 'poisoner' };
    const s = scene(chars).start();
    const seen = new Set<string>();
    for (let n = 0; n < 4; n++) {
      const line = s.truth('ann')[0] as string;
      expect(line).not.toMatch(/\(/);
      seen.add(s.g.player(as(/\b(bo|cy|di|ed|ann)\b/.exec(line)?.[0] ?? 'ann')).character as string);
      s.nextNight();
    }
    expect(seen.size).toBe(4);
  });

  it('a Mathematician hears the count, and the Storyteller can add to it', () => {
    const chars = { ann: 'mathematician', bo: 'empath', cy: 'poisoner', di: 'imp', ed: 'butler', fi: 'sailor' };
    const s = scene(chars)
      .start()
      .submit({ cy: ['bo'] })
      .review();
    expect(s.truth('ann')[0]).toMatch(/^1 /);
    s.g.st({ type: 'adjust_malfunctions', add: [as('ed')], remove: [] });
    expect(s.truth('ann')[0]).toMatch(/^2 /);
  });

  it('the Mathematician false-value cap counts each player who could have malfunctioned', () => {
    const chars = { ann: 'mathematician', bo: 'oracle', cy: 'witch', di: 'godfather', ed: 'imp', fi: 'poisoner' };
    const s = scene(chars, { fields: { godfather: { outsiders: '+1' } } })
      .start()
      .submit({ fi: ['ann'], cy: ['bo'] });
    expect(s.row('ann').alternatives.length - 1).toBe(5);
  });

  it('the Oracle: an impaired Oracle hears a false count, and a revived player no longer counts', () => {
    const chars = {
      ann: 'oracle',
      bo: 'imp',
      cy: 'poisoner',
      di: 'professor',
      ed: 'empath',
      fi: 'butler',
      gus: 'sailor',
    };
    const s = scene(chars).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: as('cy'), alive: false });
    s.g.st({ type: 'mark_alive', playerId: as('ed'), alive: false });
    s.dusk();
    expect(s.truth('ann')[0]).toMatch(/^1 dead player is evil/);
    s.submit({ gus: ['ann'] }).decide('sailor', 'ann');
    expect(s.row('ann').impaired).toBe(true);
    expect(s.row('ann').suggested[0]).toMatch(/^(0|2) /);
    const t = scene(chars).start().dawn();
    t.g.st({ type: 'mark_alive', playerId: as('cy'), alive: false });
    t.g.st({ type: 'mark_alive', playerId: as('ed'), alive: false });
    t.dusk().submit({ di: ['ed'] });
    expect(t.res.revived).toEqual(['ed']);
    expect(t.truth('ann')[0]).toMatch(/^1 /);
    expect(t.truth('di')[0]).toMatch(/You chose/);
    expect(t.truth('ed').length).toBe(1);
  });
});

describe('kills and protection', () => {
  it('a sober Sailor cannot die, and a poisoned Sailor can', () => {
    const chars = { ann: 'sailor', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['di'], bo: ['ann'] })
      .decide('sailor', 'di');
    expect(s.res.log.join('\n')).toMatch(/Sailor can't die/);
    expect(s.res.deaths).toEqual([]);
    const t = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['di'], bo: ['ann'], cy: ['ann'] })
      .decide('sailor', 'di');
    expect(t.res.deaths).toEqual(['ann']);
  });

  it('the Innkeeper protects from the Imp but not the Assassin', () => {
    const chars = { ann: 'innkeeper', bo: 'imp', cy: 'assassin', di: 'empath', ed: 'butler', fi: 'clockmaker' };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['di', 'ed'], bo: ['di'], cy: [] })
      .review();
    expect(s.res.deaths).toEqual([]);
    expect(s.res.log.join('\n')).toMatch(/protected by the Innkeeper/);
    const t = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['di', 'ed'], bo: ['fi'], cy: ['di'] })
      .review();
    expect(t.res.deaths).toContain('di');
  });

  it('a Mayor: a random bounce is recommended, and may land on a protected player', () => {
    const chars = { ann: 'mayor', bo: 'imp', cy: 'innkeeper', di: 'empath', ed: 'butler', fi: 'clockmaker' };
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const s = scene(chars).start().dawn();
      s.g.seed = seed * 31;
      s.dusk()
        .submit({ bo: ['ann'], cy: ['di', 'ed'] })
        .review();
      const d = s.decision('mayor');
      if (d.default === 'die') continue;
      found = true;
      s.decide('mayor', 'di');
      expect(s.res.deaths).toEqual([]);
      s.decide('mayor', 'die');
      expect(s.res.deaths).toEqual(['ann']);
    }
    expect(found).toBe(true);
  });

  it('a Goon: the chooser is drunk, the Goon takes their alignment, and an evil chooser does nothing to them', () => {
    const fortune = { ann: 'fortune_teller', bo: 'goon', cy: 'imp', di: 'poisoner', ed: 'empath' };
    const s = scene(fortune)
      .start()
      .submit({ ann: ['bo', 'cy'] })
      .review();
    expect(s.row('ann').impaired).toBe(true);
    expect(s.row('ann').causes.join(' ')).toMatch(/Goon/);
    expect(s.row('ann').truth[0]).toMatch(/Yes/);
    expect(s.row('ann').suggested[0]).toMatch(/No/);
    s.dawn();
    expect(s.alignment('bo')).toBe('good');
    const t = scene({ ann: 'poisoner', bo: 'goon', cy: 'imp', di: 'empath', ed: 'butler' })
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(t.alignment('bo')).toBe('evil');
    expect(t.state.conditions.filter((c) => c.type === 'poisoned')).toEqual([]);
  });

  it('the Po: no one on one night means exactly 3 on the next', () => {
    const chars = {
      ann: 'po',
      bo: 'empath',
      cy: 'butler',
      di: 'clockmaker',
      ed: 'sailor',
      fi: 'mayor',
      gus: 'poisoner',
      hal: 'virgin',
    };
    const s = scene(chars).start().nextNight();
    expect(s.specs('ann')[0]).toMatchObject({ allowDecline: true });
    expect(s.specs('ann')[0]?.fields).toHaveLength(1);
    s.submit({ ann: [] }).nextNight();
    const spec = s.specs('ann')[0];
    expect(spec?.fields).toHaveLength(3);
    expect(spec?.allowDecline).toBeFalsy();
    const key = spec?.key as string;
    const send = (actions: Record<string, { values: string[]; decline?: boolean }>) =>
      s.g.tryAs(as('ann'), { type: 'submit_night', actions }).ok;
    expect(send({ [key]: { decline: true, values: [] } })).toBe(false);
    expect(send({ [key]: { values: ['bo', 'cy'] } })).toBe(false);
    s.submit({ ann: ['bo', 'cy', 'hal'] }).review();
    expect([...s.res.deaths].sort()).toEqual(['bo', 'cy', 'hal']);
  });

  it('a starpass suggests the Scarlet Woman, the Storyteller picks another, and the new Imp is told', () => {
    const chars = {
      ann: 'imp',
      bo: 'scarlet_woman',
      cy: 'poisoner',
      di: 'empath',
      ed: 'butler',
      fi: 'clockmaker',
      gus: 'sailor',
    };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['ann'] })
      .review();
    expect(s.decision('starpass').default).toBe('bo');
    s.decide('starpass', 'cy').dawn();
    expect(s.character('cy')).toBe('imp');
    expect(s.character('bo')).toBe('scarlet_woman');
    expect(titles(s, 'cy')).toContain('You are now the Imp');
  });

  it('the Shabaloth: every past victim is offered, and one comes back', () => {
    const chars = {
      ann: 'shabaloth',
      bo: 'empath',
      cy: 'butler',
      di: 'clockmaker',
      ed: 'sailor',
      fi: 'mayor',
      gus: 'poisoner',
      hal: 'virgin',
      ivy: 'artist',
    };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'cy'] })
      .nextNight()
      .submit({ ann: ['hal', 'ivy'] })
      .decide('shabaloth', 'none')
      .nextNight();
    s.submit({ ann: ['gus', 'di'] }).review();
    const d = s.decision('shabaloth');
    expect(d.options.map((o) => o.id).sort()).toEqual(['bo', 'cy', 'hal', 'ivy', 'none']);
    s.decide('shabaloth', 'cy');
    expect(s.res.revived).toEqual(['cy']);
    s.dawn();
    expect(s.alive('cy')).toBe(true);
  });

  it("the Professor: Townsfolk revived, the Drunk not, and tonight's victims not offered", () => {
    const chars = {
      ann: 'professor',
      bo: 'shabaloth',
      cy: 'empath',
      di: 'drunk',
      ed: 'butler',
      fi: 'sailor',
      gus: 'poisoner',
      hal: 'clockmaker',
    };
    const start = () =>
      scene(chars, { believed: { di: 'seamstress' } })
        .start()
        .nextNight()
        .submit({ bo: ['cy', 'di'] })
        .nextNight();
    const s = start();
    expect([...(s.specs('ann')[0]?.fields[0]?.options ?? [])].sort()).toEqual(['cy', 'di']);
    s.submit({ ann: ['di'], bo: ['ed', 'hal'] }).decide('shabaloth', 'none');
    expect(s.res.revived).toEqual([]);
    const t = start()
      .submit({ ann: ['cy'], bo: ['ed', 'hal'] })
      .decide('shabaloth', 'none');
    expect(t.res.revived).toEqual(['cy']);
    t.dawn();
    expect(t.g.player(as('cy')).life).toMatchObject({ alive: true, diedAt: null, ghostVoteUsed: false });
    expect(t.decision).toBeDefined();
  });

  it('a revive from the Shabaloth and from the Professor leave players identical', () => {
    const chars = {
      ann: 'professor',
      bo: 'shabaloth',
      cy: 'empath',
      di: 'clockmaker',
      ed: 'butler',
      fi: 'sailor',
      gus: 'poisoner',
      hal: 'mayor',
      ivy: 'oracle',
    };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ bo: ['cy', 'di'] })
      .nextNight();
    s.submit({ ann: ['cy'], bo: ['ed', 'ivy'] })
      .decide('shabaloth', 'di')
      .dawn();
    expect(s.g.player(as('cy')).life).toEqual(s.g.player(as('di')).life);
    expect(s.alive('cy')).toBe(true);
  });

  it('the Fool survives the first attack and not the second', () => {
    const chars = { ann: 'fool', bo: 'imp', cy: 'empath', di: 'butler', ed: 'poisoner', fi: 'sailor' };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ bo: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(true);
    s.dusk()
      .submit({ bo: ['ann'] })
      .dawn();
    expect(s.alive('ann')).toBe(false);
  });

  it('a Pukka kills their previous target even while impaired, and the poison ends', () => {
    const chars = { ann: 'pukka', bo: 'empath', cy: 'butler', di: 'poisoner', ed: 'sailor', fi: 'clockmaker' };
    const s = scene(chars)
      .start()
      .submit({ ann: ['bo'] })
      .dawn();
    expect(s.impaired('bo')).toBe(true);
    s.dusk()
      .submit({ ann: ['cy'], di: ['ann'] })
      .review();
    expect(s.res.deaths).toEqual(['bo']);
    s.dawn();
    expect(s.impaired('cy')).toBe(false);
  });

  it('the No Dashii poisons the closest Townsfolk each way, alive or dead, past Outsiders and Minions', () => {
    const chars = { ann: 'clockmaker', bo: 'empath', cy: 'butler', di: 'no_dashii', ed: 'poisoner', fi: 'sailor' };
    const s = scene(chars).start();
    expect(s.impaired('bo')).toBe(true);
    expect(s.impaired('fi')).toBe(true);
    expect(s.impaired('cy')).toBe(false);
    expect(s.impaired('ed')).toBe(false);
    expect(s.impaired('ann')).toBe(false);
    s.dawn();
    s.g.st({ type: 'mark_alive', playerId: as('bo'), alive: false });
    expect(s.impaired('bo')).toBe(true);
    expect(s.impaired('ann')).toBe(false);
  });

  it('the Vigormortis: the dead Minion poisons a neighbour, offered even if dead, and keeps their ability', () => {
    const chars = { ann: 'vigormortis', bo: 'empath', cy: 'poisoner', di: 'butler', ed: 'sailor', fi: 'clockmaker' };
    const s = scene(chars).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: as('bo'), alive: false });
    s.dusk()
      .submit({ ann: ['cy'] })
      .review();
    expect(s.decision('vigormortis').options.map((o) => o.id)).toEqual(['bo', 'ed']);
    expect(s.res.deaths).toEqual(['cy']);
    s.nextNight();
    expect(s.specs('cy')[0]?.roleId).toBe('poisoner');
  });

  it('the Scarlet Woman becomes the Demon when an Assassin kills them at night', () => {
    const chars = { ann: 'assassin', bo: 'scarlet_woman', cy: 'imp', di: 'empath', ed: 'butler', fi: 'sailor' };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['cy'] })
      .review();
    expect(s.hasDecision('scarlet_woman')).toBe(true);
    s.dawn();
    expect(s.character('bo')).toBe('imp');
  });

  it('the Scarlet Woman told by day acts as the Demon that night', () => {
    const chars = { ann: 'imp', bo: 'scarlet_woman', cy: 'empath', di: 'butler', ed: 'sailor', fi: 'poisoner' };
    const s = scene(chars).start().dawn().execute('ann').dusk();
    expect(s.g.view(as('bo')).me.role?.roleId).toBe('imp');
    expect(s.specs('bo')[0]?.roleId).toBe('imp');
  });

  it('the Grandmother dies with the grandchild for a Demon kill, not for an Assassin', () => {
    const chars = {
      ann: 'grandmother',
      bo: 'imp',
      cy: 'assassin',
      di: 'empath',
      ed: 'butler',
      fi: 'sailor',
      gus: 'clockmaker',
    };
    const s = scene(chars).start().decide('grandmother_grandchild', 'di');
    expect(s.truth('ann')[0]).toMatch(/grandchild is di, the Empath/);
    s.nextNight()
      .submit({ bo: ['di'] })
      .review();
    expect(s.hasDecision('grandmother_link')).toBe(true);
    expect([...s.res.deaths].sort()).toEqual(['ann', 'di']);
    const t = scene(chars)
      .start()
      .decide('grandmother_grandchild', 'di')
      .nextNight()
      .submit({ cy: ['di'] })
      .review();
    expect(t.res.deaths).toEqual(['di']);
  });

  it('a poisoned Grandmother on night 0 gets false information and no link', () => {
    const chars = { ann: 'grandmother', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler' };
    const s = scene(chars)
      .start()
      .submit({ cy: ['ann'] })
      .nextNight()
      .submit({ bo: ['di'] })
      .review();
    expect(s.res.deaths).toEqual(['di']);
  });

  it('the Gossip: a false statement or none does nothing; a poisoned Gossip kills nobody; a Sailor survives', () => {
    const chars = {
      ann: 'gossip',
      bo: 'imp',
      cy: 'poisoner',
      di: 'empath',
      ed: 'butler',
      fi: 'sailor',
      gus: 'clockmaker',
    };
    const said = (value: string) => {
      const s = scene(chars).start().dawn();
      s.act('gossip', 'statement', [value]);
      return s.dusk();
    };
    expect(said('false').review().hasDecision('gossip_victim')).toBe(false);
    expect(
      said('true')
        .submit({ cy: ['ann'] })
        .review().res.deaths,
    ).toEqual([]);
    expect(said('true').decide('gossip_victim', 'fi').res.deaths).toEqual([]);
  });

  it('the Godfather: a player without a picker can still submit, and it records nothing', () => {
    const chars = { ann: 'godfather', bo: 'imp', cy: 'butler', di: 'drunk', ed: 'empath', fi: 'sailor', gus: 'mayor' };
    const s = scene(chars, { fields: { godfather: { outsiders: '+1' } }, believed: { di: 'seamstress' } })
      .start()
      .nextNight();
    expect(s.specs('ann')).toEqual([]);
    s.g.as(as('ann'), { type: 'submit_night', actions: {} });
    s.dawn().execute('cy').dusk();
    expect(s.specs('ann')[0]?.roleId).toBe('godfather');
    s.submit({ ann: ['gus'] }).review();
    expect(s.hasDecision('mayor')).toBe(true);
    expect(s.decision('godfather_trigger').default).toBe('yes');
  });

  it('the Witch: a poisoned Witch curses nobody, and at 3 alive there is no picker', () => {
    const chars = { ann: 'witch', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler', fi: 'sailor' };
    const s = scene(chars)
      .start()
      .submit({ ann: ['di'], cy: ['ann'] })
      .dawn();
    s.nominate('di', 'bo');
    expect(s.state.prompts).toEqual([]);
    s.g.st({ type: 'mark_alive', playerId: as('ed'), alive: false });
    s.g.st({ type: 'mark_alive', playerId: as('fi'), alive: false });
    s.g.st({ type: 'mark_alive', playerId: as('cy'), alive: false });
    s.dusk();
    expect(s.specs('ann')).toEqual([]);
  });

  it('a Slayer: the red herring is safe, and a poisoned shot at the Imp spends the use', () => {
    const chars = {
      ann: 'slayer',
      bo: 'imp',
      cy: 'poisoner',
      di: 'fortune_teller',
      ed: 'empath',
      fi: 'butler',
      gus: 'sailor',
    };
    const s = scene(chars, { fields: { fortune_teller: { herring: 'ed' } } })
      .start()
      .submit({ di: ['fi', 'ed'] })
      .dawn();
    expect(s.act('slayer', 'shoot', ['ed'], { mode: 'preview' }).effective).toBe(false);
    s.g.st({ type: 'add_condition', target: as('ann'), condition: 'poisoned' });
    s.act('slayer', 'shoot', ['bo']);
    expect(s.alive('bo')).toBe(true);
    expect(s.state.abilities[s.ability('slayer')]?.used).toBe(true);
    const abilityId = s.ability('slayer');
    const again = { type: 'day_action' as const, abilityId, action: 'shoot', values: ['bo'], mode: 'preview' as const };
    expect(s.g.tryAs(ST, again).ok).toBe(false);
  });

  it('the Assassin spends the shot even when impaired', () => {
    const chars = { ann: 'assassin', bo: 'imp', cy: 'empath', di: 'butler', ed: 'sailor', fi: 'poisoner' };
    const s = scene(chars)
      .start()
      .nextNight()
      .submit({ ann: ['cy'], fi: ['ann'] })
      .review();
    expect(s.res.deaths).toEqual([]);
    s.dawn();
    expect(s.state.abilities[s.ability('assassin')]?.used).toBe(true);
  });
});

describe('characters at the table', () => {
  it('the Huntsman: the same answer whether or not they hit, and the new character is told', () => {
    const chars = { ann: 'huntsman', bo: 'damsel', cy: 'imp', di: 'poisoner', ed: 'empath', fi: 'sailor' };
    const s = scene(chars)
      .start()
      .submit({ ann: ['bo'] })
      .review();
    const role = s.decision('huntsman_new_role').default as string;
    expect(['huntsman', 'empath', 'sailor']).not.toContain(role);
    expect(s.truth('ann')).toEqual(['You chose bo.']);
    s.dawn();
    expect(s.character('bo')).toBe(role);
    expect(titles(s, 'bo').some((t) => t.startsWith('Your role is now'))).toBe(true);
    s.dusk();
    expect(s.specs('ann')).toEqual([]);
  });

  it('the Damsel: Minions hear of them, the Marionette and Demon do not, and only one guess', () => {
    const chars = { bo: 'imp', ann: 'marionette', cy: 'poisoner', di: 'damsel', ed: 'empath', fi: 'sailor' };
    const s = scene(chars, { believed: { ann: 'seamstress' } }).start();
    expect(s.inbox('cy')).toContain('A Damsel is in play.');
    expect(s.inbox('ann')).not.toContain('A Damsel is in play.');
    expect(s.inbox('bo')).not.toContain('A Damsel is in play.');
    s.dawn();
    expect(s.dayActions().filter((a) => a.title.includes('Damsel'))).toHaveLength(1);
    s.act('damsel', 'guess', ['yes']);
    s.dusk().dawn();
    expect(s.dayActions().filter((a) => a.title.includes('Damsel'))).toEqual([]);
  });

  it('a Butler hears who they chose, cannot choose themselves, and players with no ability just acknowledge', () => {
    const chars = { ann: 'butler', bo: 'imp', cy: 'empath', di: 'sailor', ed: 'poisoner' };
    const s = scene(chars).start();
    const key = s.specs('ann')[0]?.key as string;
    s.g.as(as('cy'), { type: 'submit_night', actions: {} });
    expect(s.night.submissions['cy' as never]?.actions).toEqual({});
    expect(s.g.tryAs(as('ann'), { type: 'submit_night', actions: { [key]: { values: ['ann'] } } }).ok).toBe(false);
    s.submit({ ann: ['di'] });
    expect(s.truth('ann')[0]).toMatch(/master/);
  });

  it('a Marionette sees the believed character, and the Demon is told who they are', () => {
    const chars = { ann: 'imp', bo: 'marionette', cy: 'empath', di: 'butler', ed: 'sailor' };
    const s = scene(chars, { believed: { bo: 'seamstress' } }).start();
    const view = s.g.view(as('bo'));
    expect(view.me.role?.roleId).toBe('seamstress');
    expect(JSON.stringify(view.me)).not.toMatch(/marionette/i);
    expect(s.inbox('ann').join(' ')).toMatch(/Marionette is/);
  });

  it('the Mezepheles turns the first good player to say the word that night, and spends it', () => {
    const chars = { ann: 'mezepheles', bo: 'imp', cy: 'empath', di: 'butler', ed: 'sailor' };
    const s = scene(chars, { fields: { mezepheles: { word: 'teapot' } } }).start();
    expect(s.inbox('ann').join(' ')).toMatch(/teapot/);
    s.dawn();
    s.act('mezepheles', 'sayer', ['cy']);
    s.dusk().dawn();
    expect(s.alignment('cy')).toBe('evil');
    expect(titles(s, 'cy')).toContain('You are now evil.');
  });

  it('a live reassignment tells the player, keeps history, and refuses a character already in play', () => {
    const chars = { ann: 'assassin', bo: 'imp', cy: 'empath', di: 'butler', ed: 'sailor' };
    const s = scene(chars).start().dawn();
    const before = s.g.player(as('di')).history.length;
    expect(s.g.tryAs(ST, { type: 'assign_character', playerId: as('di'), roleId: chosen('imp') }).ok).toBe(false);
    s.g.st({ type: 'assign_character', playerId: as('di'), roleId: chosen('seamstress') });
    expect(titles(s, 'di')).toContain('Your role has changed');
    expect(s.g.player(as('di')).history.length).toBeGreaterThan(before);
  });

  it('a reconnecting phone finds its submission intact', () => {
    const chars = { ann: 'imp', bo: 'empath', cy: 'butler', di: 'clockmaker', ed: 'poisoner' };
    const s = scene(chars)
      .start()
      .submit({ cy: ['bo'] });
    expect(s.g.view(as('cy')).me.submitted).toBe(true);
    expect(Object.values(s.g.view(as('cy')).me.submission ?? {})).toEqual([{ values: ['bo'] }]);
  });

  it("the Lil' Monsta: the holder learns the Demon lines, keeps the Minion, and a Fortune Teller reads the new holder", () => {
    const chars = {
      ann: 'lil_monsta',
      bo: 'scarlet_woman',
      cy: 'poisoner',
      di: 'fortune_teller',
      ed: 'empath',
      fi: 'butler',
      gus: 'clockmaker',
    };
    const s = scene(chars, { fields: { lil_monsta: { minion: 'baron' }, fortune_teller: { herring: 'fi' } } });
    s.g.st({ type: 'suggest_bluffs' });
    s.start();
    expect(s.inbox('ann').join(' ')).toMatch(/Minions/);
    expect(s.inbox('ann').join(' ')).toMatch(/bluffs/);
    expect(s.g.view(as('cy')).me.messages.map((m) => m.title)).toEqual(['Your fellow Minions']);
    s.submit({ di: ['ed', 'gus'] }).nextNight();
    expect(s.character('ann')).toBe('baron');
    expect(s.specs('ann').map((x) => x.roleId)).toContain('lil_monsta');
    s.submit({ ann: { lil_monsta: ['bo', 'ed'] }, di: ['bo', 'gus'] }).review();
    expect(s.res.deaths).toContain('ed');
    expect(row(s, 'ann')).toBeDefined();
    expect(result(s, 'di')?.truth[0]).toMatch(/Yes/);
  });
});
