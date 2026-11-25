// What the Grimoire's seat sheet and game controls do to the game.
import { describe, expect, it } from 'vitest';
import { defaultScript } from '../../src';
import { as, chosen, titles } from '../helpers/scene';
import { scene, ST } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'imp', bo: 'poisoner', cy: 'empath', di: 't1', ed: 't2' };

describe('the Storyteller changing alignment', () => {
  it('during the game, goes in the history', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'set_alignment', playerId: pid('cy'), alignment: 'evil' });
    expect(s.alignment('cy')).toBe('evil');
    expect(s.g.player(pid('cy')).history.filter((h) => h.kind === 'alignment')).toEqual([
      { kind: 'alignment', at: { kind: 'day', n: 1 }, from: 'good', to: 'evil', reason: 'Storyteller' },
    ]);
  });

  it('during setup, is a plain set', () => {
    const s = scene(cast);
    s.g.st({ type: 'set_alignment', playerId: pid('cy'), alignment: 'evil' });
    expect(s.alignment('cy')).toBe('evil');
    expect(s.g.player(pid('cy')).history.filter((h) => h.kind === 'alignment')).toEqual([]);
  });
});

describe('the Storyteller changing a character', () => {
  it('tells the player, keeps history, and refuses a character already in play', () => {
    const s = scene(cast).start().dawn();
    const before = s.g.player(as('di')).history.length;
    expect(s.g.tryAs(ST, { type: 'assign_character', playerId: as('di'), roleId: chosen('imp') }).ok).toBe(false);
    s.g.st({ type: 'assign_character', playerId: as('di'), roleId: chosen('seamstress') });
    expect(titles(s, 'di')).toContain('Your role has changed');
    expect(s.g.player(as('di')).history.length).toBeGreaterThan(before);
  });
});

describe('play again', () => {
  it('mid-game, keeps players, seats and the script and resets the rest', () => {
    const s = scene(cast).start().dawn().kill('cy');
    s.g.st({ type: 'set_ghost_vote', playerId: as('cy'), used: true });
    const before = s.state;
    s.g.st({ type: 'play_again' });
    expect(s.state.phase.kind).toBe('setup');
    expect(s.state.storytellerId).toBe(before.storytellerId);
    expect(s.state.script).toEqual(before.script);
    expect(s.state.seats).toEqual(before.seats);
    for (const p of [...s.state.players.values()]) {
      expect(p).toMatchObject({ character: null, hasSeenRole: false, life: { alive: true, ghostVoteUsed: false } });
    }
    expect(s.state.conditions).toEqual([]);
    expect(s.state.events).toEqual([]);
    expect(s.state.abilities).toEqual(new Map());
    expect(s.g.view(as('cy')).me.messages).toEqual([]);
  });

  it('once ended by hand, with the winner the Storyteller gave', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'end_game', winner: 'evil' });
    expect(s.state.phase).toMatchObject({ kind: 'ended', winner: 'evil' });
    s.g.st({ type: 'play_again' });
    expect(s.state.phase.kind).toBe('setup');
  });
});

describe('forced back to setup', () => {
  const again = (setUp: (s: ReturnType<typeof scene>) => void = () => undefined) => {
    const s = scene({ ...cast, fi: 't3', gus: 't4' })
      .start()
      .dawn();
    s.execute('di');
    s.g.st({ type: 'force_phase', phase: 'setup' });
    setUp(s);
    s.g.st({ type: 'begin_first_night', force: true });
    s.g.st({ type: 'open_collecting' });
    s.g.st({ type: 'close_collecting', force: true });
    s.g.st({ type: 'publish_dawn', force: true });
    return s;
  };

  it("the old game's execution is not the new game's", () => {
    const s = again();
    expect(s.g.grimoire().dayEvents).toEqual([]);
    s.g.st({ type: 'start_night', force: true });
    expect(s.alive('di')).toBe(true);
  });

  it('the night starts though the player chosen then has been removed', () => {
    const s = again((x) => x.g.st({ type: 'remove_player', playerId: as('di') }));
    s.g.st({ type: 'start_night', force: true });
    expect(s.state.phase.kind).toBe('night');
  });
});

describe('New game (erase)', () => {
  it('removes everyone, the Storyteller included, and resets all but the settings', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'set_settings', countdownSeconds: 77 });
    const id = s.state.id;
    s.g.st({ type: 'new_game' });
    expect(s.state).toMatchObject({
      id,
      players: new Map(),
      storytellerId: null,
      phase: { kind: 'lobby' },
      seats: [],
      events: [],
      abilities: new Map(),
      conditions: [],
      script: defaultScript(),
    });
    expect(s.state.settings.countdownSeconds).toBe(77);
  });

  it('lets the next person to join claim Storyteller', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'new_game' });
    s.g.as(null, { type: 'join', id: pid('zed'), name: 'Zed', rolePreference: 'none', wantsStoryteller: true });
    expect(s.state.storytellerId).toBe(pid('zed'));
  });
});
