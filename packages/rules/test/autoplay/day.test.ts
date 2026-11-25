// Nominations, votes, claims, private prompts and the execution. The answer is what the table would see, and no more.
import { describe, expect, it } from 'vitest';
import { roleId } from '@ct/protocol';
import { pid } from '../helpers/game';
import { auto, drunk, type Scene } from './lib';

const base = { ann: 'imp', bo: 'm1', cy: 't1', di: 't2', ed: 't3', flo: 't4', gus: 'o1' };
const day = (s: Scene) => s.g.console().day;

describe('votes', () => {
  it('puts someone on the block with half the living, beaten only by more, and cleared by a tie', () => {
    const s = auto(base).night();
    expect(day(s)?.needed).toBe(4);
    s.nominate('cy', 'ann').vote('bo', 'cy', 'di');
    expect(day(s)?.block).toBeNull();
    s.nominate('di', 'bo').vote('cy', 'di', 'ed', 'flo');
    expect(day(s)?.block).toEqual({ playerId: pid('bo'), votes: 4 });
    s.nominate('ed', 'ann').vote('bo', 'cy', 'ed', 'flo');
    expect(day(s)?.block).toBeNull();
    s.nominate('flo', 'gus').vote('bo', 'cy', 'ed', 'flo');
    expect(day(s)?.block).toBeNull();
    s.nominate('gus', 'cy').vote('ann', 'bo', 'cy', 'ed', 'flo');
    expect(day(s)?.block).toEqual({ playerId: pid('cy'), votes: 5 });
  });

  it('spends a dead player’s one vote, and gives it back when the count is corrected', () => {
    const s = auto(base)
      .night()
      .dusk('di')
      .night({ ann: ['ed'] });
    const left = () => s.g.console().players.find((p) => p.name === 'di')?.votesLeft;
    expect(left()).toBe(true);
    s.nominate('cy', 'ann').vote('di', 'cy');
    expect(left()).toBe(false);
    s.vote('cy');
    expect(left()).toBe(true);
    s.vote('di');
    s.nominate('flo', 'bo').vote('di');
    // Spent by the first, so only the first gives it back.
    s.vote('cy');
    expect(left()).toBe(false);
    expect(s.g.rejected(pid('di'), { type: 'use_ghost_vote' })).toBe('You cannot do that now.');
  });

  it('tells the Flowergirl whether a Demon voted', () => {
    const told = (...voters: string[]) => {
      const s = auto({ ...base, cy: 'flowergirl' }).night();
      s.nominate('di', 'bo')
        .vote(...voters)
        .dusk()
        .night({ ann: ['ed'] });
      return s.inbox('cy').at(-1);
    };
    expect(told('ann', 'cy')).toMatch(/yes/i);
    expect(told('cy')).toMatch(/no/i);
  });

  it('tells a Philosopher who becomes the Flowergirl that night too', () => {
    const told = (...voters: string[]) => {
      const s = auto({ ...base, cy: 'philosopher', di: 'flowergirl' }).night();
      s.nominate('di', 'bo')
        .vote(...voters)
        .dusk()
        .night({ ann: ['ed'], cy: ['flowergirl'] });
      return s.inbox('cy').at(-1);
    };
    expect(told('ann')).toMatch(/yes/i);
    expect(told('bo')).toMatch(/no/i);
  });
});

describe('what a nomination sets off', () => {
  it('a Townsfolk who nominates the Virgin is executed, and the day is over', () => {
    const s = auto({ ...base, cy: 'virgin' })
      .night()
      .nominate('di', 'cy');
    expect(s.tell).toEqual(['di nominates cy.', 'di is executed and dies.']);
    expect(day(s)?.closed).toBe(true);
    expect(s.g.rejected(s.g.steward, { type: 'execute', playerId: null, yes: [] })).toBe('The day is over.');
    s.g.sw({ type: 'begin_night' });
  });

  it('anyone else, or a second time, nothing', () => {
    const s = auto({ ...base, cy: 'virgin' })
      .night()
      .nominate('bo', 'cy')
      .nominate('di', 'cy');
    expect(s.alive('di')).toBe(true);
    expect(day(s)?.closed).toBe(false);
  });

  it('a drunk Virgin, nothing', () => {
    const s = auto({ ...base, cy: 'virgin' }, drunk('cy'))
      .night()
      .nominate('di', 'cy');
    expect(day(s)?.nominations[0]?.lines).toEqual([]);
  });

  it('the Golem kills, unless it is the Demon, and once', () => {
    const s = auto({ ...base, gus: 'golem' })
      .night()
      .nominate('gus', 'cy');
    expect(s.tell).toEqual(['gus nominates cy.', 'cy dies.']);
    s.nominate('gus', 'di');
    expect(s.alive('di')).toBe(true);
    const t = auto({ ...base, gus: 'golem' })
      .night()
      .nominate('gus', 'ann');
    expect(t.alive('ann')).toBe(true);
  });

  it('a Witch’s cursed player dies when they nominate', () => {
    const s = auto({ ...base, bo: 'witch' })
      .night({ bo: ['di'] })
      .nominate('cy', 'di');
    expect(s.alive('di')).toBe(true);
    s.nominate('di', 'cy');
    expect(s.tell).toEqual(['di nominates cy.', 'di dies.']);
  });

  it('a drunk Witch’s does not', () => {
    const s = auto({ ...base, bo: 'witch' }, drunk('bo'))
      .night({ bo: ['di'] })
      .nominate('di', 'cy');
    expect(s.alive('di')).toBe(true);
  });

  it('a Witch King’s cursed player dies when they are nominated', () => {
    const { g, ...rest } = auto({ ...base, ann: 'witch_king' })
      .night()
      .dusk();
    void rest;
    const spec = g.view(pid('ann')).me.actions[0];
    const mode = spec?.modes?.find((m) => m.id.includes('curse'))?.id as string;
    for (const id of g.ids) {
      const actions = id === pid('ann') ? { [spec?.key as string]: { mode, values: [pid('di')] } } : {};
      g.as(id, { type: 'submit_night', actions });
    }
    g.autopilot().wait(31).as(g.steward, { type: 'call_dawn' });
    g.sw({ type: 'nominate', nominator: pid('cy'), nominee: pid('di') });
    expect(g.console().tell).toEqual(['cy nominates di.', 'di dies.']);
  });
});

describe('undoing a nomination', () => {
  it('takes it back, with what it spent', () => {
    const s = auto({ ...base, cy: 'virgin' })
      .night()
      .nominate('bo', 'cy');
    const id = day(s)?.nominations[0]?.id as number;
    expect([...s.g.state.abilities.values()].find((a) => a.roleId === 'virgin')?.used).toBe(true);
    s.g.sw({ type: 'undo_nomination', id });
    expect(day(s)?.nominations).toEqual([]);
    s.nominate('di', 'cy');
    expect(s.tell).toContain('di is executed and dies.');
  });

  it('is refused once something came of it, it was voted on, or it is not the latest', () => {
    const refused = 'It stands: something has come of it, or the day has moved on.';
    const s = auto({ ...base, gus: 'golem' })
      .night()
      .nominate('gus', 'cy');
    const undo = (i: number) =>
      s.g.rejected(s.g.steward, { type: 'undo_nomination', id: day(s)?.nominations[i]?.id as number });
    expect(undo(0)).toBe(refused);
    s.nominate('di', 'ed').vote('ed');
    expect(undo(1)).toBe(refused);
    s.nominate('ed', 'di').nominate('flo', 'di');
    expect(undo(2)).toBe(refused);
  });
});

describe('claims', () => {
  it('come from the script, whoever is in play', () => {
    const s = auto(base, {
      setup: (g) => g.st({ type: 'set_script', roleIds: [...g.state.script, roleId('slayer')] }),
    });
    s.night();
    expect(day(s)?.claims.map((c) => c.title)).toEqual(['Slayer shot']);
  });

  it('a Slayer, a bluffer, a drunk, a spent one and a miss all read the same', () => {
    const cast = { ...base, cy: 'slayer' };
    const nothing = (who: string, what: string) => [`${who} shoots ${what}.`, 'Nothing happens.'];
    expect(auto(cast).night().claim('slayer', 'shot', 'cy', 'bo')).toEqual(nothing('cy', 'bo'));
    expect(auto(cast).night().claim('slayer', 'shot', 'di', 'ann')).toEqual(nothing('di', 'ann'));
    expect(auto(cast, drunk('cy')).night().claim('slayer', 'shot', 'cy', 'ann')).toEqual(nothing('cy', 'ann'));
    const s = auto(cast).night();
    s.claim('slayer', 'shot', 'cy', 'bo');
    expect(s.claim('slayer', 'shot', 'cy', 'ann')).toEqual(nothing('cy', 'ann'));
    expect(auto(cast).night().claim('slayer', 'shot', 'cy', 'ann')).toEqual(['cy shoots ann.', 'ann dies.']);
  });

  it('a Psychopath kills once a day', () => {
    const s = auto({ ...base, bo: 'psychopath' }).night();
    expect(s.claim('psychopath', 'kill', 'cy', 'di')).toEqual(['cy chooses di to die.', 'Nothing happens.']);
    expect(s.claim('psychopath', 'kill', 'bo', 'di')).toEqual(['bo chooses di to die.', 'di dies.']);
    expect(s.claim('psychopath', 'kill', 'bo', 'ed').at(-1)).toBe('Nothing happens.');
  });

  it('a Psychopath who wins roshambo does not die, and it is asked of everyone', () => {
    const cast = { ...base, bo: 'psychopath' };
    const s = auto(cast).night();
    expect(day(s)?.executionQuestions).toHaveLength(1);
    expect(s.execute('bo', ['psychopath']).tell).toEqual(['bo is executed and does not die.']);
    expect(auto(cast).night().execute('cy', ['psychopath']).tell).toEqual(['cy is executed and dies.']);
    expect(auto(cast).night().execute('bo').tell).toEqual(['bo is executed and dies.']);
    expect(auto(cast, drunk('bo')).night().execute('bo', ['psychopath']).tell).toEqual(['bo is executed and dies.']);
  });

  it('a Minion’s first Damsel guess is the only one, and anyone else’s is a bluff', () => {
    const s = auto({ ...base, gus: 'damsel' }).night();
    expect(s.claim('damsel', 'guess', 'cy', 'gus').at(-1)).toBe('Nothing happens.');
    expect(s.claim('damsel', 'guess', 'bo', 'di').at(-1)).toBe('Nothing happens.');
    expect(s.claim('damsel', 'guess', 'bo', 'gus').at(-1)).toBe('Nothing happens.');
    expect(s.over).toBeUndefined();
  });

  it('a Juggler who guessed enters the guesses that night', () => {
    const s = auto({ ...base, cy: 'juggler' }).night();
    s.claim('juggler', 'juggled', 'cy');
    s.dusk();
    expect(s.g.view(pid('cy')).me.actions[0]?.title).toBe('Juggler');
    const t = auto({ ...base, cy: 'juggler' }).night();
    t.claim('juggler', 'juggled', 'di');
    t.dusk();
    expect(t.g.view(pid('cy')).me.actions[0]?.key).toBe('decoy');
  });

  it('a Moonchild’s first choice stands', () => {
    const s = auto({ ...base, gus: 'moonchild' })
      .night()
      .dusk()
      .night({ ann: ['gus'] });
    expect(s.claim('moonchild', 'chose', 'cy', 'ed').at(-1)).toBe('Nothing happens.');
    expect(s.claim('moonchild', 'chose', 'gus', 'di').at(-1)).toBe('Nothing happens.');
    s.claim('moonchild', 'chose', 'gus', 'ed');
    // The Imp chooses the dead.
    s.dusk().night({ ann: ['gus'] });
    expect(s.alive('di')).toBe(false);
    expect(s.alive('ed')).toBe(true);
  });

  it('a day death is on the table at once', () => {
    const s = auto({ ...base, cy: 'slayer' }).night();
    s.claim('slayer', 'shot', 'cy', 'ann');
    expect(s.g.console().players.find((p) => p.name === 'ann')?.alive).toBe(false);
    expect(day(s)?.needed).toBe(3);
  });

  it('refuses only what is public', () => {
    const s = auto({ ...base, cy: 'slayer' }).night();
    const make = (id: string, claim: string, values: string[]) =>
      s.g.rejected(s.g.steward, { type: 'make_claim', roleId: roleId(id), claim, values: values.map(pid) });
    expect(make('psychopath', 'kill', ['cy', 'di'])).toBe('That cannot be claimed on this script.');
    expect(make('slayer', 'shot', ['cy'])).toBe('Choose the players.');
  });
});

describe('private prompts', () => {
  it('asks the Mezepheles who said the word, and nobody else', () => {
    const s = auto(
      { ...base, bo: 'mezepheles' },
      {
        setup: (g) => {
          const f = g.grimoire().setup.fields[0];
          if (f) g.st({ type: 'suggest_setup_field', abilityId: f.abilityId, field: f.field });
        },
      },
    ).night();
    const prompts = (who: string) => s.g.view(pid(who)).me.dayPrompts ?? [];
    expect(prompts('cy')).toEqual([]);
    const [spec] = prompts('bo');
    expect(spec?.recorded).toBeNull();
    const key = spec?.key as string;
    s.g.as(pid('bo'), { type: 'answer_day_prompt', key, values: [pid('cy')] });
    expect(prompts('bo')[0]?.recorded).toEqual([pid('cy')]);
    expect(s.g.rejected(pid('cy'), { type: 'answer_day_prompt', key, values: [pid('cy')] })).toBe(
      'You cannot do that now.',
    );
    s.dusk().night();
    expect(s.g.player(pid('cy')).alignment).toBe('evil');
  });

  it('reminds the Butler, the Zealot, the Golem and the Inquisitor, in private', () => {
    for (const r of ['butler', 'zealot', 'golem', 'inquisitor']) {
      const s = auto({ ...base, gus: r });
      expect(s.g.view(pid('gus')).me.reminder).toBeTruthy();
      expect(s.g.view(pid('cy')).me.reminder).toBeUndefined();
    }
  });
});

describe('the execution', () => {
  it('is told at once, cannot be changed, and the night waits for it', () => {
    const s = auto(base).night();
    expect(s.g.rejected(s.g.steward, { type: 'begin_night' })).toMatch(/Record the execution/);
    expect(s.execute('cy').tell).toEqual(['cy is executed and dies.']);
    expect(s.g.rejected(s.g.steward, { type: 'execute', playerId: pid('di'), yes: [] })).toBe('The day is over.');
    expect(s.g.rejected(s.g.steward, { type: 'nominate', nominator: pid('di'), nominee: pid('ed') })).toBe(
      'The day is over.',
    );
    s.g.sw({ type: 'begin_night' });
    expect(s.g.console().phase).toMatchObject({ kind: 'night', n: 1, stage: 'collecting' });
  });

  it('says only that a protected player does not die', () => {
    const s = auto({ ...base, bo: 'devils_advocate' })
      .night()
      .dusk()
      .night({ bo: ['ann'] })
      .execute('ann');
    expect(s.tell).toEqual(['ann is executed and does not die.']);
    expect(
      auto({ ...base, cy: 'fool' })
        .night()
        .execute('cy').tell,
    ).toEqual(['cy is executed and does not die.']);
  });

  it('keeps today’s poison until the night', () => {
    const s = auto({ ...base, bo: 'poisoner' })
      .night({ bo: ['cy'] })
      .execute('di');
    const poisoned = () => s.g.state.conditions.some((c) => c.target === pid('cy'));
    expect(poisoned()).toBe(true);
    s.g.sw({ type: 'begin_night' });
    expect(poisoned()).toBe(false);
  });
});

describe('no oracle', () => {
  it('a nomination answers the same whoever is secretly what', () => {
    const replies = [
      { ...base, cy: 'virgin', gus: 'golem' },
      { ...base, cy: 't2', di: 'virgin', gus: 'o1' },
    ].map((c) => {
      const s = auto(c).night();
      const res = s.g.tryAs(s.g.steward, { type: 'nominate', nominator: pid('bo'), nominee: pid('cy') });
      return { ok: res.ok, data: res.ok ? res.data : res.error, nominations: day(s)?.nominations, tell: s.tell };
    });
    expect(replies[0]).toEqual(replies[1]);
  });

  it('the execution and the night never wait on a hidden question', () => {
    // A Storyteller's Start Night is refused by these until they are answered.
    for (const cast of [
      { ...base, cy: 'cannibal' },
      { ...base, gus: 'moonchild' },
    ]) {
      const s = auto(cast)
        .night()
        .dusk('bo')
        .night({ ann: ['gus'] });
      s.execute('di');
      s.g.sw({ type: 'begin_night' });
    }
  });
});
