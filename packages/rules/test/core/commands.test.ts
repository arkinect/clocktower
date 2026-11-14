// Commands the larger tests pass by: each is driven here through dispatch, as the server would.
import { describe, expect, it } from 'vitest';
import type { PlayerId, RoleId } from '@ct/protocol';
import { begin, cast, pid, seated, ST, TestGame } from '../helpers/game';
import { DEMON, MINION, TOWN, TRAVELLER } from '../helpers/plain';
import { scene } from '../scenario';

const FIVE = { Ann: TOWN[0]!, Bo: TOWN[1]!, Cy: TOWN[2]!, Di: MINION[0]!, Ed: DEMON[0]! };

const join = (g: TestGame, name: string, wantsStoryteller = false) =>
  g.as(null, { type: 'join', id: pid(name), name, rolePreference: 'none', wantsStoryteller });
const seats = (g: TestGame) => g.state.seats.filter((x) => x.left === null).map((x) => x.playerId);

describe('joining and seats', () => {
  it('a player who joins during setup takes the next seat', () => {
    const g = seated(Object.keys(FIVE));
    join(g, 'Flo');
    expect(seats(g)).toEqual(['ann', 'bo', 'cy', 'di', 'ed', 'flo']);
    expect(g.grimoire().players.find((p) => p.id === 'flo')?.seat).toBe(5);
    expect(g.grimoire().setup.checklist.filter((c) => /unseated/.test(c.label))).toEqual([]);
  });

  it('in the lobby a joiner waits for setup to open', () => {
    const g = new TestGame();
    join(g, 'Storyteller', true);
    join(g, 'Ann');
    expect(seats(g)).toEqual([]);
    g.as(pid('Storyteller'), { type: 'open_setup' });
    expect(seats(g)).toEqual(['ann']);
  });

  it('once the game is running a joiner only watches', () => {
    const g = begin(cast(FIVE));
    join(g, 'Flo');
    expect(seats(g)).not.toContain('flo');
  });
});

describe('claim_storyteller', () => {
  it('gives the empty chair to the first player who asks, and to nobody after', () => {
    const g = new TestGame();
    join(g, 'Ann');
    join(g, 'Bo');
    expect(g.state.storytellerId).toBeNull();
    g.as(pid('Ann'), { type: 'claim_storyteller' });
    expect(g.state.storytellerId).toBe('ann');
    expect(g.rejected(pid('Bo'), { type: 'claim_storyteller' })).toMatch(/already a Storyteller/);
  });
});

describe('set_type_counts', () => {
  it('takes four counts that add up to the seated players, and null goes back to the default', () => {
    const g = seated(['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus']);
    const counts = () => g.grimoire().setup.counts;
    expect(counts()).toMatchObject({ target: [5, 0, 1, 1], source: 'default' });
    expect(g.rejected(ST, { type: 'set_type_counts', counts: [4, 0, 1, 1] })).toBe(
      'Counts must add up to the player count (7).',
    );
    g.st({ type: 'set_type_counts', counts: [4, 1, 1, 1] });
    expect(counts()).toMatchObject({ target: [4, 1, 1, 1], source: 'override' });
    g.st({ type: 'set_type_counts', counts: null });
    expect(counts()).toMatchObject({ target: [5, 0, 1, 1], source: 'default' });
  });
});

describe('a type-count override', () => {
  const names = ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus'];
  const overridden = () => {
    const g = seated(names);
    g.st({ type: 'set_type_counts', counts: [4, 1, 1, 1] });
    return g;
  };
  const counts = (g: TestGame) => g.grimoire().setup.counts;
  const total = (g: TestGame) => counts(g).target.reduce((a, b) => a + b, 0);

  it('goes back to the default when a late joiner is seated', () => {
    const g = overridden();
    join(g, 'Hal');
    expect(counts(g).source).toBe('default');
    expect(total(g)).toBe(8);
  });

  it('goes back to the default when a player is removed', () => {
    const g = overridden();
    g.st({ type: 'remove_player', playerId: pid('Gus') });
    expect(counts(g).source).toBe('default');
    expect(total(g)).toBe(6);
  });

  it('goes back to the default when the seating leaves someone out', () => {
    const g = overridden();
    g.st({ type: 'set_seating', order: names.slice(0, 6).map(pid) });
    expect(counts(g).source).toBe('default');
  });

  it('stays when the same players only change seats', () => {
    const g = overridden();
    g.st({ type: 'set_seating', order: [...names].reverse().map(pid) });
    g.st({ type: 'randomise_seating' });
    expect(counts(g)).toMatchObject({ target: [4, 1, 1, 1], source: 'override' });
  });
});

describe('set_setup_field', () => {
  const word = (s: ReturnType<typeof scene>) =>
    (s.state.abilities[s.ability('mezepheles')]?.state as { setup?: Record<string, string | null> }).setup?.['word'];

  it('stores a typed value as it was checked: trimmed', () => {
    const s = scene({ a: 'mezepheles', b: 't1', c: 'd1', d: 't2', e: 't3' });
    const field = { type: 'set_setup_field' as const, abilityId: s.ability('mezepheles'), field: 'word' };
    s.g.st({ ...field, value: '  banana  ' });
    expect(word(s)).toBe('banana');
    expect(s.g.rejected(ST, { ...field, value: '   ' })).toBe('Enter a value.');
    s.g.st({ ...field, value: null });
    expect(word(s)).toBeNull();
  });
});

describe('the night countdown', () => {
  it('extend_countdown adds to the time left, or to now once the time is up', () => {
    const g = begin(cast(FIVE));
    const deadline = () => (g.state.phase.kind === 'night' ? g.state.phase.deadline : null);
    const before = deadline() as number;
    expect(before).toBeGreaterThan(g.now);
    g.st({ type: 'extend_countdown', seconds: 60 });
    expect(deadline()).toBe(before + 60_000);
    g.now = before + 10 * 60_000;
    g.st({ type: 'extend_countdown', seconds: 30 });
    expect(deadline()).toBe(g.now + 30_000);
  });

  it('clear_submission lets a player choose again, while choices are still being collected', () => {
    const g = begin(cast(FIVE));
    g.as(pid('Ann'), { type: 'submit_night', actions: {} });
    expect(g.view(pid('Ann')).me.submitted).toBe(true);
    g.st({ type: 'clear_submission', playerId: pid('Ann') });
    expect(g.view(pid('Ann')).me.submitted).toBe(false);
    g.st({ type: 'close_collecting', force: true });
    expect(g.rejected(ST, { type: 'clear_submission', playerId: pid('Ann') })).toBe('Not collecting.');
  });
});

describe('remove_traveller', () => {
  it('a Traveller who leaves gives up their seat and their ability, and nobody else can leave', () => {
    const traveller = TRAVELLER[0] as RoleId;
    const s = scene({ a: 't1', b: 't2', c: 'd1', d: 'm1', e: 't3' }, { extra: [traveller] })
      .start()
      .dawn();
    const vi = 'vi' as PlayerId;
    s.g.as(null, { type: 'join', id: vi, name: 'Vi', rolePreference: 'none', wantsStoryteller: false });
    s.g.st({ type: 'add_traveller', playerId: vi, roleId: traveller, alignment: 'good' });
    expect(seats(s.g)).toContain(vi);
    const held = () =>
      Object.values(s.state.abilities).filter(
        (x) => x.holder.kind === 'player' && x.holder.id === vi && x.activeUntil !== 'removed',
      );
    expect(held()).toHaveLength(1);
    s.g.st({ type: 'remove_traveller', playerId: vi });
    expect(seats(s.g)).not.toContain(vi);
    expect(s.state.players[vi]?.removal).toMatchObject({ kind: 'left' });
    expect(held()).toEqual([]);
    expect(s.g.rejected(ST, { type: 'remove_traveller', playerId: 'a' as PlayerId })).toBe(
      'Only a Traveller can leave.',
    );
  });
});
