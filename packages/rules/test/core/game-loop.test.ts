import { describe, expect, it } from 'vitest';
import { replay } from '../../src';
import { begin, cast, dawn, dusk, pid, ST, TestGame, seated } from '../helpers/game';
import { DEMON, MINION, OUT, TOWN } from '../helpers/plain';

const FIVE = {
  Ann: TOWN[0]!,
  Bo: TOWN[1]!,
  Cy: TOWN[2]!,
  Di: MINION[0]!,
  Ed: DEMON[0]!,
};

describe('a five-player game with ability-less characters', () => {
  it('runs from lobby to ended', () => {
    const g = new TestGame();
    g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
    expect(g.state.storytellerId).toBe(ST);
    for (const n of Object.keys(FIVE)) {
      g.as(null, { type: 'join', id: pid(n), name: n, rolePreference: 'none', wantsStoryteller: false });
    }
    g.st({ type: 'open_setup' });
    expect(g.state.seats).toHaveLength(5);
    g.st({ type: 'set_script', roleIds: Object.values(FIVE).concat(TOWN[3]!, TOWN[4]!, TOWN[5]!) });
    g.st({ type: 'randomise_seating' });
    g.st({ type: 'publish_seating' });
    g.st({
      type: 'assign_many',
      assignments: Object.fromEntries(Object.entries(FIVE).map(([n, r]) => [pid(n), r])),
    });
    g.st({ type: 'suggest_bluffs' });
    expect(g.grimoire().setup.checklist.filter((c) => c.blocking && !c.done)).toEqual([]);
    g.st({ type: 'begin_first_night', force: false });
    expect(g.state.phase.kind).toBe('night');
    expect(g.view(pid('Ed')).me.messages.some((m) => m.title === 'Demon information')).toBe(true);
    expect(g.view(pid('Di')).me.messages.some((m) => m.title === 'Your fellow Minions')).toBe(true);
    expect(g.view(pid('Ann')).me.messages).toEqual([]);
    g.as(pid('Ann'), { type: 'seen_role' });
    g.st({ type: 'open_collecting' });
    for (const n of Object.keys(FIVE)) g.as(pid(n), { type: 'submit_night', actions: {} });
    g.st({ type: 'close_collecting', force: false });
    g.st({ type: 'publish_dawn', force: false });
    expect(g.state.phase).toEqual({ kind: 'day', n: 1 });
    expect(g.view(pid('Ann')).me.messages.at(-1)?.lines).toEqual(['You learned nothing.']);

    g.st({ type: 'record_nomination', nominator: pid('Ann'), nominee: pid('Di') });
    g.st({ type: 'record_vote', nominee: pid('Di'), count: 3, voters: null });
    g.st({ type: 'record_execution', playerId: pid('Di'), died: true });
    // Chosen, not yet executed: that happens as the night starts.
    expect(g.player(pid('Di')).life.alive).toBe(true);
    g.st({ type: 'set_notes', text: 'Quiet day.' });
    expect(g.grimoire().notes).toBe('Quiet day.');

    g.st({ type: 'start_night' });
    expect(g.state.phase).toMatchObject({ kind: 'night', n: 1, stage: 'collecting' });
    expect(g.player(pid('Di')).life.alive).toBe(false);
    expect(g.player(pid('Di')).life.cause).toBe('execution');
    g.as(pid('Di'), { type: 'use_ghost_vote' });
    expect(g.player(pid('Di')).life.ghostVoteUsed).toBe(true);
    g.st({ type: 'close_collecting', force: true });
    g.st({ type: 'publish_dawn', force: true });
    g.st({ type: 'record_execution', playerId: pid('Ed'), died: true });
    expect(g.state.gameEnd).toEqual([]);
    g.st({ type: 'start_night' });
    expect(g.state.gameEnd.map((x) => x.winner)).toEqual(['good']);
    g.st({ type: 'confirm_game_end', key: g.state.gameEnd[0]!.key });
    expect(g.state.phase).toMatchObject({ kind: 'ended', winner: 'good' });

    expect(replay(g.code, g.createdAt, g.log)).toEqual(g.state);
    expect(JSON.stringify(replay(g.code, g.createdAt, g.log))).toBe(JSON.stringify(g.state));
  });

  it('play again keeps the players and starts fresh', () => {
    const g = begin(cast(FIVE));
    dawn(g);
    g.st({ type: 'end_game', winner: 'evil' });
    g.st({ type: 'play_again' });
    expect(g.state.phase).toEqual({ kind: 'setup' });
    expect(Object.keys(g.state.players)).toHaveLength(6);
    expect(g.state.events).toEqual([]);
    expect(g.player(pid('Ann')).character).toBeNull();
    expect(g.state.abilities).toEqual({});
    expect(g.state.seats).toHaveLength(5);
  });
});

describe('the dispatcher', () => {
  it('rejects a bad schema, a wrong actor and a wrong phase', () => {
    const g = seated(['Ann', 'Bo']);
    expect(g.rejected(pid('Ann'), { type: 'open_setup' })).toMatch(/Storyteller/);
    expect(g.rejected(ST, { type: 'open_setup' })).toMatch(/right now/);
    expect(g.rejected(ST, { type: 'start_night' })).toMatch(/right now/);
    expect(g.rejected(pid('nobody'), { type: 'seen_role' })).toMatch(/Unknown player/);
    expect(g.rejected(pid('Ann'), { type: 'rename_player', playerId: pid('Bo'), name: 'x' }));
  });

  it('ignores nothing silently: a rejected command changes no state and logs nothing', () => {
    const g = seated(['Ann']);
    const before = g.state;
    const logged = g.log.length;
    g.rejected(pid('Ann'), { type: 'open_setup' });
    expect(g.state).toBe(before);
    expect(g.log).toHaveLength(logged);
  });

  it('requires force to close collecting before the deadline', () => {
    const g = begin(cast(FIVE));
    expect(g.rejected(ST, { type: 'close_collecting', force: false })).toMatch(/Waiting/);
    g.now += g.state.settings.countdownSeconds * 1000 + 1;
    g.st({ type: 'close_collecting', force: false });
    expect(g.state.phase).toMatchObject({ stage: 'review' });
  });

  it('force_phase moves between phases with its own command', () => {
    const g = begin(cast(FIVE));
    g.st({ type: 'force_phase', phase: 'day' });
    expect(g.state.phase).toEqual({ kind: 'day', n: 1 });
    g.st({ type: 'force_phase', phase: 'ended' });
    expect(g.state.phase.kind).toBe('ended');
    g.st({ type: 'force_phase', phase: 'setup' });
    expect(g.state.phase.kind).toBe('setup');
  });
});

describe('setup', () => {
  it('suggest_distribution follows the chart', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const g = seated(names);
    g.st({ type: 'suggest_distribution' });
    expect(g.grimoire().setup.counts).toMatchObject({ target: [5, 1, 1, 1], actual: [5, 1, 1, 1] });
  });

  it('blocks the first night until the checklist is done', () => {
    const g = seated(['Ann', 'Bo']);
    expect(g.rejected(ST, { type: 'begin_first_night', force: false })).toMatch(/Setup is incomplete/);
  });

  it('will not assign a character twice or off the script', () => {
    const g = seated(['Ann', 'Bo']);
    g.st({ type: 'assign_character', playerId: pid('Ann'), roleId: TOWN[0]! });
    expect(g.rejected(ST, { type: 'assign_character', playerId: pid('Bo'), roleId: TOWN[0]! })).toMatch(/already/);
    expect(g.rejected(ST, { type: 'set_bluffs', roleIds: [DEMON[0]!] })).toMatch(/Bluffs/);
    expect(g.player(pid('Ann')).alignment).toBe('good');
    g.st({ type: 'assign_character', playerId: pid('Bo'), roleId: OUT[0]! });
    g.st({ type: 'assign_character', playerId: pid('Bo'), roleId: MINION[0]! });
    expect(g.player(pid('Bo')).alignment).toBe('evil');
  });
});

describe('deaths and revivals in the day', () => {
  it('records them and tells the table only at dawn', () => {
    const g = begin(cast(FIVE));
    dawn(g);
    g.st({ type: 'mark_alive', playerId: pid('Bo'), alive: false });
    expect(g.player(pid('Bo')).life).toMatchObject({ alive: false, cause: 'storyteller' });
    g.st({ type: 'mark_alive', playerId: pid('Bo'), alive: true });
    expect(g.player(pid('Bo')).life.alive).toBe(true);
    dusk(g);
    dawn(g);
    expect(g.state.phase).toEqual({ kind: 'day', n: 2 });
  });
});
