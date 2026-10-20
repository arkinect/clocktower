// Owner changes: dead players in pickers, Vigormortis + Scarlet Woman, Balloonist names only, story log.
import { describe, expect, it } from 'vitest';
import { act, build, nextNight, resolve, resultFor, runNight, submit, tryAct } from './helpers';
import { actionSpecs } from '../src/engine/actions';
import { setupWarnings, suggestDistribution } from '../src/engine/setup';
import { makeRng } from '../src/engine/rng';
import { playerView } from '../src/engine/views';

describe('owner changes', () => {
  it('night pickers include dead players (abilities can be sunk into bodies)', () => {
    const g = build(['imp', 'poisoner', 'empath', 'butler', 'sailor', 'clockmaker']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    nextNight(g);
    expect(actionSpecs(g.s, g.p.imp)[0].fields[0].options).toContain(g.p.empath);
    expect(actionSpecs(g.s, g.p.poisoner)[0].fields[0].options).toContain(g.p.empath);
    submit(g, { [g.p.imp]: { imp: [g.p.empath] }, [g.p.poisoner]: { poisoner: [g.p.empath] } });
    const res = resolve(g);
    expect(res.deaths).toEqual([]);
    expect(res.log.join('\n')).toMatch(/already dead/);
  });

  it('suggested distributions never put the Vigormortis and Scarlet Woman together; manual gets a warning', () => {
    const g = build(['vigormortis', 'scarlet_woman', 'empath', 'butler', 'sailor']);
    expect(setupWarnings(g.s).some((w) => /known bugs/.test(w))).toBe(true);
    for (let seed = 0; seed < 300; seed++) {
      const d = suggestDistribution(g.s, makeRng(seed));
      if ('error' in d) continue;
      const roles = Object.values(d);
      expect(roles.includes('vigormortis') && roles.includes('scarlet_woman')).toBe(false);
    }
  });

  it('Balloonist only ever shows a name', () => {
    const g = build(['balloonist', 'imp', 'empath', 'butler', 'poisoner']);
    const r = resultFor(resolve(g), g.p.balloonist)!;
    expect(r.trueLines[0]).not.toMatch(/\(/);
    expect('balloonistRevealsType' in g.s.settings).toBe(false);
  });

  it('story records roles, impairment and targets per night, admin only', () => {
    const g = build(['imp', 'poisoner', 'empath', 'butler', 'sailor']);
    runNight(g, { [g.p.poisoner]: { poisoner: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.butler]: { butler: [g.p.imp] } });
    const n0 = g.s.story.find((e) => e.kind === 'night' && e.night === 0)!;
    if (n0.kind !== 'night') throw new Error();
    const emp = n0.players.find((p) => p.playerId === g.p.empath)!;
    expect(emp.impaired).toBe(true);
    expect(emp.causes).toContain('poisoned:poisoner');
    expect(emp.received![0].title).toBe('Empath');
    expect(emp.received![0].trueLines).toBeDefined(); // poisoned: sent info differs from the truth
    const pois = n0.players.find((p) => p.playerId === g.p.poisoner)!;
    expect(pois.received).toEqual([]);
    expect(pois.actions[0].input).toMatch(/empath/);
    act(g, { type: 'record_execution', playerId: g.p.butler, died: true });
    nextNight(g);
    const day = g.s.story.find((e) => e.kind === 'day')!;
    if (day.kind !== 'day') throw new Error();
    expect(day.executedPlayerId).toBe(g.p.butler);
    expect(JSON.stringify(playerView(g.s, g.p.empath, 0))).not.toMatch(/story/);
  });
});

describe('owner change: Minions know each other', () => {
  it('each Minion learns the other Minions on Night 0, not the Demon or the Marionette', () => {
    const g = build(['imp', 'poisoner', 'scarlet_woman', 'marionette', 'empath', 'butler', 'sailor']);
    const pm = playerView(g.s, g.p.poisoner, 0).me.messages.find((m) => m.title === 'Your fellow Minions')!;
    const sw = g.s.players.find((p) => p.id === g.p.scarlet_woman)!.name;
    expect(pm.lines[0]).toBe(`The other Minions are: ${sw}.`);
    const text = JSON.stringify(playerView(g.s, g.p.poisoner, 0).me.messages);
    expect(text).not.toMatch(/marionette|imp/i);
    expect(playerView(g.s, g.p.marionette, 0).me.messages).toEqual([]);
    expect(playerView(g.s, g.p.imp, 0).me.messages.map((m) => m.title)).toEqual(['Demon information']);
  });

  it('a lone Minion is told so', () => {
    const g = build(['imp', 'poisoner', 'empath', 'butler', 'sailor']);
    expect(playerView(g.s, g.p.poisoner, 0).me.messages[0].lines[0]).toBe('You are the only Minion.');
  });
});

describe('owner change: players see deaths only at dawn', () => {
  it('a day death shows to players the next morning; the Storyteller sees it at once', () => {
    const g = build(['imp', 'poisoner', 'empath', 'butler', 'sailor', 'clockmaker']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'record_execution', playerId: g.p.butler, died: true });
    expect(g.s.players.find((p) => p.id === g.p.butler)!.alive).toBe(false); // live state (Storyteller)
    expect(playerView(g.s, g.p.empath, 0).deadAtDawn).toEqual([]);
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.clockmaker] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    resolve(g);
    expect(playerView(g.s, g.p.empath, 0).deadAtDawn).toEqual([]); // still night: no update yet
    act(g, { type: 'publish_night' });
    expect(playerView(g.s, g.p.empath, 0).deadAtDawn.sort()).toEqual([g.p.butler, g.p.clockmaker].sort());
  });
});

describe('owner change: Philosopher picker hidden once used', () => {
  it('stays hidden even if the used chip is toggled back to Unused', () => {
    const g = build(['philosopher', 'imp', 'empath', 'butler', 'sailor', 'fortune_teller']);
    runNight(g, { [g.p.philosopher]: { philosopher: ['fortune_teller'] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'set_flag', playerId: g.p.philosopher, key: 'philosopher_used', value: false });
    nextNight(g);
    expect(actionSpecs(g.s, g.p.philosopher).map((s) => s.key)).toEqual(['fortune_teller']);
  });
});

describe('owner change: ghost vote', () => {
  it('only a dead player can have their vote marked used; a revive restores it', () => {
    const g = build(['imp', 'empath', 'butler', 'sailor', 'poisoner']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(tryAct(g, { type: 'set_ghost_vote', playerId: g.p.empath, used: true }).ok).toBe(false);
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    act(g, { type: 'set_ghost_vote', playerId: g.p.empath, used: true });
    expect(g.s.players.find((p) => p.id === g.p.empath)!.ghostVoteUsed).toBe(true);
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: true });
    expect(g.s.players.find((p) => p.id === g.p.empath)!.ghostVoteUsed).toBe(false);
  });
});

describe('owner change: players record their own ghost vote', () => {
  it('a dead player can mark their vote used; an alive one cannot', () => {
    const g = build(['imp', 'empath', 'butler', 'sailor', 'poisoner']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(tryAct(g, { type: 'use_ghost_vote' }, g.p.empath).ok).toBe(false);
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    act(g, { type: 'use_ghost_vote' }, g.p.empath);
    expect(playerView(g.s, g.p.empath, 0).me.ghostVoteUsed).toBe(true);
    act(g, { type: 'set_ghost_vote', playerId: g.p.empath, used: false });
    expect(playerView(g.s, g.p.empath, 0).me.ghostVoteUsed).toBe(false);
  });

  it('play again (from any phase) keeps players, seats and the role pool and resets the rest', () => {
    const g = build(['imp', 'poisoner', 'empath', 'butler', 'sailor']);
    act(g, { type: 'set_role_enabled', roleId: 'gambler', enabled: false });
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    act(g, { type: 'set_ghost_vote', playerId: g.p.empath, used: true });
    const before = g.s;
    act(g, { type: 'play_again' }); // mid-game, without ending first
    const s = g.s;
    expect(s.phase).toBe('SETUP');
    expect(s.adminId).toBe(before.adminId);
    expect(s.enabledRoles.gambler).toBe(false);
    expect(s.players.map((p) => [p.id, p.name, p.seat, p.tokens])).toEqual(before.players.map((p) => [p.id, p.name, p.seat, p.tokens]));
    expect(s.players.every((p) => p.alive && !p.ghostVoteUsed && !p.deadAt && !p.hasSeenRole)).toBe(true);
    expect(s.assignments).toEqual({});
    expect(s.setup.demonBluffs).toEqual([]);
    expect([s.nightNumber, s.dayNumber, s.night, s.story, s.messages, s.effects]).toEqual([-1, 0, null, [], {}, []]);
    expect(playerView(s, g.p.empath, 0).me.messages).toEqual([]);
  });
});
