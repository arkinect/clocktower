// The night without a Storyteller: who it waits for, what it says, and when dawn can be called. And recovery.
import { describe, expect, it } from 'vitest';
import { loadState, project, replay, saveState, stewardView } from '../../src';
import { makeRng } from '../../src/util/rng';
import { table } from '../helpers/autoplay';
import { pid, ST } from '../helpers/game';
import { auto } from './lib';

const base = { ann: 'imp', bo: 'm1', cy: 't1', di: 't2', ed: 't3', flo: 't4', gus: 'o1' };

describe('collecting', () => {
  it('waits for everyone, with a night action or not', () => {
    const { g } = auto(base);
    expect(g.console().night).toMatchObject({ notDone: 7, names: null, closed: false, dawn: null });
    for (const [i, id] of g.ids.entries()) {
      g.as(id, { type: 'submit_night', actions: {} }).autopilot();
      expect(g.console().night).toMatchObject({ notDone: 6 - i, closed: i === 6 });
    }
  });

  it('gives whoever has no action a picker that does nothing', () => {
    const s = auto(base).night().dusk();
    const [decoy] = s.g.view(pid('cy')).me.actions;
    expect(decoy).toMatchObject({ key: 'decoy', allowDecline: false });
    s.g.as(pid('cy'), { type: 'submit_night', actions: { decoy: { values: [pid('di')] } } });
    expect(s.g.view(pid('cy')).me).toMatchObject({ submitted: true, submission: {} });
  });

  it('names the late only once the countdown is over, and only then skips them', () => {
    const { g } = auto(base);
    expect(g.rejected(g.steward, { type: 'skip_player', playerId: pid('cy') })).toBe('Wait for the countdown.');
    g.as(pid('cy'), { type: 'submit_night', actions: {} }).wait(1000);
    expect(g.console().night?.names).toHaveLength(6);
    expect(g.console().night?.names).not.toContain(pid('cy'));
    g.sw({ type: 'add_time', seconds: 60 });
    expect(g.console().night?.names).toBeNull();
    g.wait(61);
    for (const id of g.console().night?.names ?? []) g.sw({ type: 'skip_player', playerId: id });
    expect(g.autopilot().console().night?.closed).toBe(true);
  });

  it('skips an optional ability as a decline, and draws one that must choose', () => {
    const s = auto({ ...base, cy: 'assassin', bo: 'poisoner' })
      .night()
      .dusk();
    s.g.wait(1000);
    for (const who of ['bo', 'cy']) s.g.sw({ type: 'skip_player', playerId: pid(who) });
    const p = s.g.state.phase;
    const sub = (who: string) =>
      p.kind === 'night' ? Object.values(p.submissions.get(pid(who))?.actions ?? {})[0] : null;
    expect(sub('cy')).toEqual({ decline: true, values: [] });
    expect(sub('bo')?.values).toHaveLength(1);
  });
});

describe('the night ending', () => {
  const ravenkeeper = (target: string) =>
    auto({ ...base, cy: 'ravenkeeper' })
      .night()
      .dusk()
      .done({ ann: [target] });

  it('shows one screen from a player’s own submission to dawn, questions out or not', () => {
    const s = auto({ ...base, cy: 'ravenkeeper' })
      .night()
      .dusk();
    const phase = () => s.g.view(pid('di')).phase;
    expect(phase().stage).toBe('collecting');
    s.g.as(pid('di'), { type: 'submit_night', actions: {} });
    const ended = phase();
    expect(ended).toMatchObject({ kind: 'night', stage: null, deadline: null });
    s.done({ ann: ['cy'] });
    expect(s.g.open()).toHaveLength(1);
    expect(phase()).toEqual(ended);
    expect(s.g.view(pid('cy')).me.questions).toHaveLength(1);
  });

  it('offers dawn no sooner than 30 seconds, and says nothing of what it waits for until then', () => {
    const asked = ravenkeeper('cy');
    const quiet = ravenkeeper('di');
    expect(asked.g.console().night).toEqual(quiet.g.console().night);
    expect(asked.g.console().night?.dawn).toBe('soon');
    const refusal = 'The night is not over yet.';
    for (const s of [asked, quiet]) expect(s.g.rejected(s.g.steward, { type: 'call_dawn' })).toBe(refusal);
    asked.g.wait(31);
    quiet.g.wait(31);
    expect(quiet.g.console().night?.dawn).toBe('ready');
    expect(asked.g.console().night).toMatchObject({ dawn: 'waiting', canSkip: false });
    expect(asked.g.rejected(asked.g.steward, { type: 'call_dawn' })).toBe(refusal);
    asked.g.wait(600);
    expect(asked.g.console().night?.canSkip).toBe(true);
    asked.g.sw({ type: 'skip_questions' });
    expect(asked.g.console().night?.dawn).toBe('ready');
    asked.g.sw({ type: 'call_dawn' });
  });

  it('tells nothing of the night before dawn is called', () => {
    const views = ['cy', 'di'].map((target) => {
      const s = auto(base)
        .night()
        .dusk()
        .done({ ann: [target] });
      s.g.wait(60);
      return stewardView(s.g.state, pid('ed'), { now: s.g.now });
    });
    expect(views[0]).toEqual(views[1]);
  });

  it('tells who died in seat order, and never why', () => {
    const s = auto({ ...base, ann: 'po' })
      .night()
      .dusk()
      .night();
    expect(s.tell).toEqual(['Nobody died in the night.']);
    s.dusk().night({ ann: ['flo', 'cy', 'ed'] });
    expect(s.tell).toEqual(['cy, ed and flo died in the night.']);
  });

  it('puts only last night’s deaths on phones, if they are announced there', () => {
    const s = auto(base)
      .night()
      .dusk()
      .night({ ann: ['cy'] });
    s.g.sw({ type: 'steward_settings', announceDeaths: true });
    expect(s.g.view(pid('di')).announcedDeaths).toEqual([pid('cy')]);
    s.dusk().night({ ann: ['di'] });
    expect(s.g.view(pid('ed')).announcedDeaths).toEqual([pid('di')]);
  });
});

describe('away', () => {
  it('skips their night, and answers for them', () => {
    const s = auto({ ...base, cy: 'ravenkeeper' })
      .night()
      .dusk();
    s.g.sw({ type: 'set_away', playerId: pid('cy'), away: true });
    const key = s.g.view(pid('ann')).me.actions[0]?.key as string;
    for (const id of s.g.ids) {
      if (id === pid('cy')) continue;
      const actions = id === pid('ann') ? { [key]: { values: [pid('cy')] } } : {};
      s.g.as(id, { type: 'submit_night', actions }).autopilot();
    }
    expect(s.g.console().night).toMatchObject({ closed: true, notDone: 0 });
    expect(s.g.open()).toEqual([]);
    s.g.wait(31).sw({ type: 'call_dawn' });
    expect(s.tell).toEqual(['cy died in the night.']);
  });

  it('marked once the night has closed, says nothing of whether they were asked', () => {
    const s = auto({ ...base, cy: 'ravenkeeper' })
      .night()
      .dusk()
      .done({ ann: ['cy'] });
    s.g.sw({ type: 'set_away', playerId: pid('cy'), away: true }).autopilot();
    expect(s.g.open()).toHaveLength(1);
  });
});

describe('recovery', () => {
  it('hands the steward’s job to another player', () => {
    const s = auto(base).night();
    s.g.sw({ type: 'hand_steward', playerId: pid('cy') });
    expect(project(s.g.state, pid('ann'), { now: 0 }).kind).toBe('player');
    expect(project(s.g.state, pid('cy'), { now: 0 }).kind).toBe('steward');
    expect(s.g.rejected(pid('ann'), { type: 'execute', playerId: null, yes: [] })).toBe(
      'Only the steward can do that.',
    );
  });

  it('hands the game to a player who agrees to be its Storyteller, and every phone says so', () => {
    const s = auto(base).night();
    s.g.sw({ type: 'offer_storyteller', playerId: pid('cy') });
    expect(s.g.view(pid('cy')).me.offeredStoryteller).toBe(true);
    expect(s.g.rejected(pid('di'), { type: 'accept_storyteller' })).toBe('You cannot do that now.');
    s.g.as(pid('cy'), { type: 'accept_storyteller' });
    expect(project(s.g.state, pid('cy'), { now: 0 }).kind).toBe('storyteller');
    for (const id of [pid('ann'), pid('di')]) {
      const view = project(s.g.state, id, { now: 0 });
      expect(view.kind === 'player' && view.tableNotes).toEqual([
        'cy has stopped playing, and is the Storyteller now.',
      ]);
    }
    s.g.as(pid('cy'), { type: 'start_night' });
    s.g.as(pid('cy'), { type: 'close_collecting', force: true });
    s.g.as(pid('cy'), { type: 'publish_dawn', force: true });
    s.g.as(pid('cy'), { type: 'end_game', winner: 'good' });
    s.g.as(pid('cy'), { type: 'play_again' });
    expect(s.g.ids).not.toContain(pid('cy'));
  });

  it('does not run the sundown again when handed over after it', () => {
    const s = auto(base).night().execute('di');
    s.g.sw({ type: 'offer_storyteller', playerId: pid('cy') });
    s.g.as(pid('cy'), { type: 'accept_storyteller' });
    const before = s.g.state.events.length;
    s.g.as(pid('cy'), { type: 'start_night' });
    expect(s.g.state.events).toHaveLength(before);
  });

  it('abandons: no winner, and everything is shown, and not before', () => {
    const s = auto(base).night();
    expect(s.g.console().revealed).toBeNull();
    s.g.sw({ type: 'abandon' });
    expect(s.g.state.phase).toEqual({ kind: 'ended', reason: 'steward', winner: null });
    const view = s.g.console();
    expect(view.revealed?.players.find((p) => p.name === 'ann')?.character).toBe('imp');
    expect(view.revealed?.story.length).toBeGreaterThan(0);
  });

  it('plays again in the same mode, with everyone seated', () => {
    const s = auto(base).night();
    s.g.sw({ type: 'abandon' }).as(s.g.steward, { type: 'steward_play_again' });
    expect(s.g.state).toMatchObject({ phase: { kind: 'setup' }, stewardId: pid('ann'), storytellerId: null });
    expect(s.g.ids).toHaveLength(7);
    expect(s.g.state.autoplay).toMatchObject({ nominations: [], record: [], demonDead: false, over: null });
    expect(s.g.state.players.has(ST)).toBe(false);
  });
});

it('replays exactly from its log, and survives being saved', () => {
  const g = table(9, undefined, 77);
  const rng = makeRng(5);
  g.sw({ type: 'deal' });
  for (let i = 0; i < 2; i++) {
    g.night(rng);
    if (g.console().over) break;
    g.sw({ type: 'nominate', nominator: pid('n1'), nominee: pid('n2') });
    if (!g.console().over && !g.console().day?.closed) g.sw({ type: 'execute', playerId: null, yes: [] });
    if (g.console().over) break;
    g.sw({ type: 'begin_night' });
  }
  expect(replay(g.code, 0, g.log)).toEqual(g.state);
  expect(loadState(saveState(g.state)).state).toEqual(g.state);
});
