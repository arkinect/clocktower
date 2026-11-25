// The app decides when the game is over, and who won. The tables of docs/autoplay.md, Game end.
import { describe, expect, it } from 'vitest';
import { auto, drunk } from './lib';

const base = { ann: 'imp', bo: 'm1', cy: 't1', di: 't2', ed: 't3', flo: 't4', gus: 'o1' };

describe('the Demon dead', () => {
  it('is announced at the next dawn, and not before', () => {
    const s = auto(base).night().execute('ann');
    expect(s.tell).toEqual(['ann is executed and dies.']);
    expect(s.over).toBeUndefined();
    expect(s.g.state.autoplay?.demonDead).toBe(true);
    s.g.sw({ type: 'begin_night' });
    s.night();
    expect(s.over).toBe('good');
    expect(s.g.rejected(s.g.steward, { type: 'execute', playerId: null, yes: [] })).toBe(
      'The game is over. Announce it.',
    );
    s.g.sw({ type: 'announce_end' });
    expect(s.g.state.phase).toEqual({ kind: 'ended', reason: 'steward', winner: 'good' });
  });

  it('looks the same when a Scarlet Woman takes over, and the game goes on', () => {
    const s = auto({ ...base, bo: 'scarlet_woman' })
      .night()
      .execute('ann');
    expect(s.tell).toEqual(['ann is executed and dies.']);
    s.g.sw({ type: 'begin_night' });
    s.night({ bo: ['cy'] });
    expect(s.over).toBeUndefined();
    expect(s.tell).toEqual(['cy died in the night.']);
  });

  it('at night, with nobody to take over, is won at that dawn', () => {
    const s = auto({ ...base, bo: 't4', flo: 'm1' })
      .night()
      .dusk();
    s.g.state.players.get(s.g.ids[0] as never);
    // The only Minion dies, then the Imp kills themself.
    s.night({ ann: ['flo'] })
      .dusk()
      .night({ ann: ['ann'] });
    expect(s.over).toBe('good');
  });

  it('is settled: a Damsel guessed afterwards changes nothing', () => {
    const s = auto({ ...base, gus: 'damsel', cy: 'slayer' }).night();
    expect(s.claim('slayer', 'shot', 'cy', 'ann')).toEqual(['cy shoots ann.', 'ann dies.']);
    expect(s.over).toBeUndefined();
    s.claim('damsel', 'guess', 'bo', 'gus');
    expect(s.over).toBeUndefined();
    s.dusk().night();
    expect(s.over).toBe('good');
  });
});

describe('wins at once', () => {
  it('a Damsel guessed', () => {
    const s = auto({ ...base, gus: 'damsel' }).night();
    s.claim('damsel', 'guess', 'bo', 'gus');
    expect(s.over).toBe('evil');
  });

  it('a Mayor with 3 alive and no execution', () => {
    const s = auto({ ann: 'imp', bo: 'm1', cy: 'mayor', di: 't2', ed: 't3' })
      .night()
      .dusk('di')
      .night({ ann: ['ed'] });
    s.execute(null);
    expect(s.over).toBe('good');
  });

  it('two left, one of them the Demon', () => {
    const s = auto({ ann: 'imp', bo: 'm1', cy: 't1', di: 't2', ed: 't3' })
      .night()
      .dusk('bo')
      .night({ ann: ['di'] });
    s.execute('cy');
    expect(s.over).toBe('evil');
  });
});

describe('the Mastermind', () => {
  const cast = { ...base, bo: 'mastermind' };
  it.each([
    ['cy', 'evil'],
    ['bo', 'good'],
  ])('has an extra day: %s executed, %s wins at once', (who, winner) => {
    const s = auto(cast).night().dusk('ann').night();
    expect(s.over).toBeUndefined();
    s.execute(who);
    expect(s.over).toBe(winner);
  });

  it('and nobody executed: good wins when the town wakes', () => {
    const s = auto(cast).night().dusk('ann').night().execute(null);
    expect(s.over).toBeUndefined();
    s.g.sw({ type: 'begin_night' });
    s.night();
    expect(s.over).toBe('good');
  });

  it('poisoned at sundown, and well again that night, has none', () => {
    const s = auto({ ...cast, gus: 'poisoner' })
      .night({ gus: ['bo'] })
      .dusk('ann')
      .night({ gus: ['cy'] });
    expect(s.over).toBe('good');
  });

  it('well at sundown, and poisoned that night, has one', () => {
    const s = auto({ ...cast, gus: 'poisoner' })
      .night({ gus: ['cy'] })
      .dusk('ann')
      .night({ gus: ['bo'] });
    expect(s.over).toBeUndefined();
    s.execute('cy');
    expect(s.over).toBe('evil');
  });

  it('drunk, has none', () => {
    expect(auto(cast, drunk('bo')).night().dusk('ann').night().over).toBe('good');
  });
});

describe('the Al-Hadikhia', () => {
  const cast = { ...base, ann: 'al_hadikhia' };
  const all = (x: string) => ({ ann: [x], bo: [x], cy: [x], di: [x], ed: [x], flo: [x], gus: [x] });
  const small = { ann: 'al_hadikhia', bo: 'm1', cy: 't1', di: 't2', ed: 't3' };

  it('alone in the morning, evil wins', () => {
    const s = auto({ ann: 'al_hadikhia', bo: 'm1', cy: 't1', di: 't2', ed: 't3' }).night().dusk('bo');
    s.night({ ann: ['cy', 'di', 'ed'] }, all('die'));
    expect(s.over).toBe('evil');
  });

  it('with 1 other, evil wins', () => {
    const s = auto(small).night().dusk('bo');
    s.night({ ann: ['cy', 'di', 'bo'] }, { ...all('die') });
    expect(s.over).toBe('evil');
  });

  it('with 2 others, nobody has won yet', () => {
    const s = auto(small).night().dusk();
    s.night({ ann: ['cy', 'di', 'bo'] }, { ...all('die'), cy: ['live'] });
    expect(s.over).toBeUndefined();
    s.dusk();
    expect(s.over).toBeUndefined();
  });

  it('dead, with all three having chosen to live, good wins', () => {
    const s = auto(cast).night().dusk();
    s.night({ ann: ['ann', 'cy', 'di'] }, all('live'));
    expect(s.over).toBe('good');
  });

  it('has the three choices told to the table, after the deaths', () => {
    const s = auto(cast).night().dusk();
    s.night({ ann: ['cy', 'di', 'ed'] }, { ...all('live'), di: ['die'] });
    expect(s.tell).toEqual(['di died in the night.', 'The Al-Hadikhia chose cy, di and ed.']);
  });

  const jinx = { ...cast, bo: 'mastermind' };
  it.each([
    ['live', 'evil'],
    ['die', 'good'],
  ])('executed with a Mastermind: all three %s, %s wins on waking', (choice, winner) => {
    const s = auto(jinx).night().dusk('ann');
    s.night({ ann: ['cy', 'di', 'ed'] }, all(choice));
    expect(s.over).toBe(winner);
  });

  it('executed with a poisoned Mastermind: no jinx', () => {
    const s = auto({ ...jinx, gus: 'poisoner' })
      .night({ gus: ['bo'] })
      .dusk('ann')
      .night({ gus: ['cy'] });
    expect(s.over).toBe('good');
  });

  it('who never chooses has three drawn, when skipped', () => {
    const s = auto(jinx).night().dusk('ann');
    const { g } = s;
    for (const id of g.ids) if (id !== g.steward) g.as(id, { type: 'submit_night', actions: {} });
    g.wait(1000).sw({ type: 'skip_player', playerId: g.steward }).autopilot();
    const asked = g.open();
    expect(asked.length).toBeGreaterThan(0);
    g.wait(200).sw({ type: 'skip_questions' }).autopilot();
    g.sw({ type: 'call_dawn' });
    expect(['good', 'evil']).toContain(s.over);
  });
});
