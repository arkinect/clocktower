// Who may do what in autoplay. Nobody is the Storyteller, so nothing of theirs is reachable.
import { describe, expect, it } from 'vitest';
import { Command, type PlayerId } from '@ct/protocol';
import { dispatch, project } from '../../src';
import { makeRng } from '../../src/util/rng';
import { table } from '../helpers/autoplay';
import { pid, ST, TestGame } from '../helpers/game';

/** Every command that is not the Storyteller's. A new Storyteller command is covered by not being here. */
const OTHERS = new Set<string>([
  ...['join', 'claim_storyteller', 'seen_role', 'submit_night', 'answer_question', 'use_ghost_vote'],
  ...['answer_day_prompt', 'accept_storyteller'],
  ...['leave_autoplay', 'deal', 'open_night', 'add_time', 'skip_player', 'skip_questions', 'retry_night', 'call_dawn'],
  ...['nominate', 'undo_nomination', 'count_vote', 'make_claim', 'execute', 'begin_night', 'announce_end', 'set_away'],
  ...['hand_steward', 'offer_storyteller', 'abandon', 'auto_close', 'auto_answer'],
]);
const types = Command.options.map((o) => o.shape.type.value as string);
const storytellers = types.filter((t) => !OTHERS.has(t) && !t.startsWith('steward_'));

/** Any command of this type that parses. */
function sample(type: string): unknown {
  const values: Record<string, unknown> = {
    ...{ playerId: pid('n1'), name: 'X', roleId: 'imp', roleIds: [], order: [], counts: null, force: true },
    ...{ key: 'x', option: 'x', abilityId: 'a1', field: 'x', value: null, actions: {}, choice: { values: [] } },
    ...{ nominator: pid('n1'), nominee: pid('n2'), count: 1, voters: null, died: true, text: 'x', alive: true },
    ...{ id: 'x', winner: 'good', values: [], mode: 'accept', action: 'x', add: [], remove: [], used: true },
  };
  const shape = Command.options.find((o) => o.shape.type.value === type)?.shape as Record<string, unknown>;
  return { type, ...Object.fromEntries(Object.entries(values).filter(([k]) => k in shape)) };
}

describe('autoplay permissions', () => {
  it('refuses every Storyteller command, from anyone, in every phase', () => {
    expect(storytellers.length).toBeGreaterThan(40);
    const g = table(7);
    const phases = [g.state];
    g.sw({ type: 'deal' });
    phases.push(g.state);
    g.night(makeRng(1));
    phases.push(g.state);
    g.sw({ type: 'abandon' });
    phases.push(g.state);
    let parsed = 0;
    for (const state of phases) {
      for (const type of storytellers) {
        const command = sample(type);
        if (Command.safeParse(command).success) parsed += 1;
        for (const who of [g.steward, pid('n1')]) {
          const res = dispatch(state, who, command, { now: 1, seed: 1 });
          // What this test's sample does not parse is refused too, but says nothing.
          if (!res.ok && res.error === 'Bad request.') continue;
          expect(res).toEqual({ ok: false, error: 'Only the Storyteller can do that.' });
        }
      }
    }
    expect(parsed).toBeGreaterThan(phases.length * 25);
  });

  it('refuses a steward’s command from any other player, and the server’s from everyone', () => {
    const g = table(7);
    for (const type of types.filter((t) => t.startsWith('steward_') || ['deal', 'abandon', 'call_dawn'].includes(t))) {
      const res = dispatch(g.state, pid('n1'), sample(type), { now: 1, seed: 1 });
      expect(res.ok).toBe(false);
      if (!res.ok && res.error !== 'Bad request.') expect(res.error).toBe('Only the steward can do that.');
    }
    for (const type of ['auto_close', 'auto_answer'] as const) {
      expect(g.rejected(g.steward, { type })).toBe('You cannot do that.');
    }
  });

  it('lets nobody become the Storyteller', () => {
    const g = table(7);
    expect(g.rejected(pid('n2'), { type: 'claim_storyteller' })).toBe('There is already a Storyteller.');
    g.as(null, { type: 'join', id: pid('late'), name: 'late', rolePreference: 'none', wantsStoryteller: true });
    expect(g.state.storytellerId).toBeNull();
    for (const id of g.state.players.keys()) {
      expect(project(g.state, id as PlayerId, { now: 0 }).kind).toBe(id === g.steward ? 'steward' : 'player');
    }
  });

  it('is refused to a Storyteller’s game, every one of them', () => {
    const g = new TestGame();
    g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
    for (const type of [...OTHERS, ...types].filter((t) => t.startsWith('steward_') || t === 'deal')) {
      const res = dispatch(g.state, ST, sample(type), { now: 1, seed: 1 });
      expect(res.ok).toBe(false);
    }
    expect(g.rejected(ST, { type: 'accept_storyteller' })).toBeTruthy();
  });

  it('drops the roles it cannot use, with a notice, and gives them back if the mode is left', () => {
    const g = new TestGame();
    g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
    const all = g.state.script;
    g.st({ type: 'choose_autoplay' });
    const view = project(g.state, ST, { now: 0 });
    expect(view.kind === 'steward' && [...view.dropped].sort()).toEqual([
      'artist',
      'fisherman',
      'gossip',
      'organ_grinder',
      'recluse',
    ]);
    expect(g.rejected(ST, { type: 'steward_script', roleIds: ['artist' as never] })).toMatch(/Artist cannot be/);
    g.as(ST, { type: 'leave_autoplay' });
    expect([...g.state.script].sort()).toEqual([...all].sort());
    expect(g.state).toMatchObject({ storytellerId: ST, stewardId: null, autoplay: null });
  });

  /** A Storyteller's game in setup, with six players, its seats shown on phones and its characters chosen. */
  const inSetup = () => {
    const g = new TestGame();
    g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) {
      g.as(null, { type: 'join', id: pid(n), name: n, rolePreference: 'none', wantsStoryteller: false });
    }
    g.st({ type: 'open_setup' }).st({ type: 'publish_seating' });
    g.st({ type: 'suggest_distribution' }).st({ type: 'suggest_bluffs' });
    return g;
  };

  it('is switched on and off in setup, by the Storyteller alone, and seats the steward', () => {
    const g = inSetup();
    expect(g.rejected(pid('a'), { type: 'choose_autoplay' })).toBe('Only the Storyteller can do that.');
    const before = g.state;
    g.st({ type: 'choose_autoplay' });
    const on = project(g.state, ST, { now: 0 });
    expect(on.kind === 'steward' && on.players.find((p) => p.id === ST)?.seat).toBe(6);
    expect(on.kind === 'steward' && on.me.me.seated).toBe(true);
    const phone = project(g.state, pid('a'), { now: 0 });
    expect(phone.players.find((p) => p.id === ST)).toMatchObject({ seat: 6, isStoryteller: false });
    expect(g.rejected(pid('a'), { type: 'leave_autoplay' })).toBe('Only the steward can do that.');

    // Off again, the Storyteller has what they had chosen.
    g.as(ST, { type: 'leave_autoplay' });
    expect(g.state.seats).toEqual(before.seats);
    expect(g.state.publishedSeating).toEqual(before.publishedSeating);
    expect(g.state.players).toEqual(before.players);
    expect(project(g.state, ST, { now: 0 }).kind).toBe('storyteller');
  });

  it('deals as if nothing had been set up before it was switched on', () => {
    const fresh = inSetup();
    for (const id of [...fresh.state.players.keys()]) {
      if (id !== ST) fresh.st({ type: 'assign_character', playerId: id, roleId: null });
    }
    const games = [inSetup(), fresh].map((g) => {
      g.st({ type: 'choose_autoplay' });
      expect(g.state.players.get(pid('a'))?.history.length).toBeGreaterThan(0);
      g.seed = 5;
      g.as(ST, { type: 'deal' });
      return g;
    });
    for (const g of games) {
      for (const p of g.state.players.values()) {
        expect(p.character, p.name).not.toBeNull();
        expect(p.history.filter((x) => x.kind === 'character')).toHaveLength(1);
      }
      expect(g.rejected(ST, { type: 'leave_autoplay' })).toBe('You cannot do that right now.');
    }
    const characters = games.map((g) => [...g.state.players.values()].map((p) => p.character));
    expect(characters[0]).toEqual(characters[1]);
  });

  it('fixes the mode once the characters are dealt', () => {
    const g = table(7).sw({ type: 'deal' });
    expect(g.rejected(g.steward, { type: 'leave_autoplay' })).toBe('You cannot do that right now.');
  });
});
