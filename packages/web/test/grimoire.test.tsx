// The Grimoire's seat sheet and game controls: what each control sends. Views are built by hand.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbilityView, ConditionView, GrimoirePlayer, type StorytellerView } from '@ct/protocol';

const run = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const catalog = vi.hoisted(() => [
  { roleId: 'empath', name: 'Empath', type: 'townsfolk' },
  { roleId: 'slayer', name: 'Slayer', type: 'townsfolk' },
  { roleId: 'imp', name: 'Imp', type: 'demon' },
  { roleId: 'beggar', name: 'Beggar', type: 'traveller' },
]);
vi.mock('../src/app/store', () => ({
  useCommand: () => ({ run, pending: false }),
  useGame: () => ({ catalog, jinxes: [] }),
  useNames: () => ({
    players: { a: 'Ann', b: 'Bo' },
    roles: { empath: 'Empath', slayer: 'Slayer', imp: 'Imp', beggar: 'Beggar' },
  }),
}));

import { ChangeCharacter, Grimoire, NewGameButton, Seat } from '../src/storyteller/Grimoire';

afterEach(() => {
  cleanup();
  run.mockClear();
  vi.useRealTimers();
});

const ability = (over: Record<string, unknown>) =>
  AbilityView.parse({
    id: 'x',
    roleId: 'slayer',
    name: 'Slayer',
    shownAs: null,
    origin: 'character',
    perceivedOnly: false,
    used: false,
    active: true,
    oncePerGame: true,
    usageAuto: false,
    reminder: null,
    dayReminder: false,
    from: 'Night 0',
    survivesDeath: false,
    summary: [],
    ...over,
  });

const player = (over: Record<string, unknown>) =>
  GrimoirePlayer.parse({
    id: 'a',
    name: 'Ann',
    seat: 0,
    alive: true,
    deathCause: null,
    character: 'empath',
    alignment: 'good',
    self: { character: 'empath', alignment: 'good' },
    abilities: [],
    conditions: [],
    impaired: false,
    causes: [],
    ghostVoteUsed: false,
    hasSeenRole: true,
    rolePreference: 'none',
    connected: true,
    departed: false,
    isDemon: false,
    ...over,
  });

const view = (players: GrimoirePlayer[], over: Record<string, unknown> = {}) =>
  ({
    players,
    phase: { kind: 'day', n: 2, stage: null, deadline: null, winner: null, endedReason: null },
    script: ['empath', 'slayer', 'imp', 'beggar'],
    settings: { notifyOnRoleChange: true },
    setup: { bluffs: [], fields: [] },
    storytellerAbilities: [],
    gameEnd: [],
    review: null,
    ...over,
  }) as unknown as StorytellerView;

/** Presses a hold button and waits out the hold. */
function hold(name: string) {
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name }));
  act(() => {
    vi.advanceTimersByTime(3000);
  });
}

describe('the seat sheet', () => {
  const seat = (p: GrimoirePlayer, others: GrimoirePlayer[] = [], over: Record<string, unknown> = {}) =>
    render(<Seat view={view([p, ...others], over)} p={p} onChangeCharacter={vi.fn()} />);

  it('shows no online or offline status', () => {
    seat(player({ connected: false }));
    expect(screen.queryByText(/offline|online/)).toBeNull();
  });

  it('shows the seat, the character in its type colour and the alignment as segments', async () => {
    seat(player({ id: 'b', name: 'Bo', seat: 1 }), [player({ seat: 0 })]);
    expect(screen.getByText(/Seat 2/)).toBeTruthy();
    expect(screen.getByText('Empath').className).toContain('type-townsfolk');
    const alignment = screen.getByRole('group', { name: 'Alignment of Bo' });
    expect(within(alignment).getByRole('button', { name: 'Good' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(within(alignment).getByRole('button', { name: 'Evil' }));
    expect(run).toHaveBeenCalledWith({ type: 'set_alignment', playerId: 'b', alignment: 'evil' });
  });

  it('kills the living through + status, and offers no dead vote', async () => {
    seat(player({}));
    expect(screen.queryByText(/dead vote/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '+ status' }));
    const add = screen.getByRole('group', { name: 'Add a status to Ann' });
    expect(within(add).queryByRole('button', { name: 'dead vote used' })).toBeNull();
    await userEvent.click(within(add).getByRole('button', { name: 'dead' }));
    expect(run).toHaveBeenCalledWith({ type: 'mark_alive', playerId: 'a', alive: false });
  });

  it('removing "dead" revives; a dead player with their vote shows no vote status', async () => {
    seat(player({ alive: false, deathCause: 'demon_kill' }));
    expect(screen.getByText(/demon kill/)).toBeTruthy();
    expect(screen.queryByText(/dead vote/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Revive Ann' }));
    expect(run).toHaveBeenCalledWith({ type: 'mark_alive', playerId: 'a', alive: true });
  });

  it('adds "dead vote used" through + status', async () => {
    seat(player({ alive: false }));
    await userEvent.click(screen.getByRole('button', { name: '+ status' }));
    expect(screen.queryByRole('button', { name: 'dead' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'dead vote used' }));
    expect(run).toHaveBeenCalledWith({ type: 'set_ghost_vote', playerId: 'a', used: true });
  });

  it('removing "dead vote used" gives the vote back', async () => {
    seat(player({ alive: false, ghostVoteUsed: true }));
    expect(screen.getByText('dead vote used')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '+ status' }));
    expect(screen.queryByRole('button', { name: 'dead vote used' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Give Ann their dead vote back' }));
    expect(run).toHaveBeenCalledWith({ type: 'set_ghost_vote', playerId: 'a', used: false });
  });

  it('toggles a once-per-game ability by hand, unless the engine tracks it', async () => {
    const { unmount } = seat(player({ abilities: [ability({ id: 'a1' })] }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Slayer used' })).getByRole('button', { name: 'Used' }),
    );
    expect(run).toHaveBeenCalledWith({ type: 'set_ability_used', abilityId: 'a1', used: true });
    unmount();
    seat(player({ abilities: [ability({ usageAuto: true, used: true })] }));
    expect(screen.queryByRole('group', { name: 'Slayer used' })).toBeNull();
    expect(screen.getByText('Used, tracked automatically')).toBeTruthy();
  });

  it("labels the Marionette's drunk condition as their own role", () => {
    seat(
      player({
        conditions: [
          { id: 'c1', type: 'drunk', name: null, label: 'drunk', until: 'removed', sourceLabel: 'Marionette' },
        ],
      }),
    );
    expect(screen.getByText('drunk (own role)')).toBeTruthy();
    expect(screen.queryByText('Marionette, until removed', { exact: false })).toBeNull();
  });

  it('does not offer drunk to the Drunk, whose own character makes them so', async () => {
    seat(player({ impaired: true, causes: ['drunk:Drunk'] }));
    expect(screen.getByText('drunk (own role)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '+ status' }));
    expect(screen.queryByRole('button', { name: 'drunk' })).toBeNull();
    expect(screen.getByRole('button', { name: 'poisoned' })).toBeTruthy();
  });

  it('says where a gained ability came from and when, but not for their own character', () => {
    const { unmount } = seat(player({ abilities: [ability({})] }));
    expect(screen.queryByText(/own character/)).toBeNull();
    unmount();
    seat(player({ abilities: [ability({ origin: 'granted', from: 'Night 2', survivesDeath: true })] }));
    expect(screen.getByText(/gained Night 2/)).toBeTruthy();
    expect(screen.getByText('keeps ability when dead')).toBeTruthy();
  });

  it('adds and removes conditions', async () => {
    seat(
      player({
        conditions: [
          ConditionView.parse({
            id: 'c1',
            type: 'poisoned',
            name: null,
            label: 'poisoned',
            until: 'dusk',
            sourceLabel: 'Poisoner',
          }),
        ],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: '+ status' }));
    // Already poisoned, so poisoned is not offered again.
    expect(screen.queryByRole('button', { name: 'poisoned' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'drunk' }));
    expect(run).toHaveBeenCalledWith({ type: 'add_condition', target: 'a', condition: 'drunk' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove poisoned from Ann' }));
    expect(run).toHaveBeenCalledWith({ type: 'remove_condition', conditionId: 'c1' });
  });

  it('tags a player a setup field names', () => {
    const field = {
      abilityId: 'f',
      field: 'redHerring',
      title: 'Red herring',
      kind: 'player',
      options: [],
      value: 'a',
      suggestible: true,
    };
    seat(player({}), [], { setup: { bluffs: [], fields: [field] } });
    expect(screen.getByText('Red herring')).toBeTruthy();
  });
});

describe('changing a character', () => {
  it('sends nothing until Confirm is held, and holds back roles already in play', async () => {
    const onDone = vi.fn();
    const ann = player({});
    const bo = player({ id: 'b', name: 'Bo', seat: 1, character: 'imp' });
    render(<ChangeCharacter view={view([ann, bo])} p={ann} onDone={onDone} />);
    const select = screen.getByLabelText('New character for Ann') as HTMLSelectElement;
    expect((screen.getByRole('option', { name: 'Imp (in play)' }) as HTMLOptionElement).disabled).toBe(true);
    // Ann is no Traveller, so no Traveller is offered.
    expect(screen.queryByRole('option', { name: 'Beggar' })).toBeNull();
    await userEvent.selectOptions(select, 'slayer');
    expect(screen.getByText('Empath → Slayer')).toBeTruthy();
    expect(screen.getByText(/told 'Your role has changed'/)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
    hold('Confirm');
    expect(run).toHaveBeenCalledWith({ type: 'assign_character', playerId: 'a', roleId: 'slayer' });
  });

  it('names the impairment on a seat token, never a bare "impaired"', () => {
    const drunk = ConditionView.parse({
      id: 'c1',
      type: 'drunk',
      name: null,
      label: 'drunk',
      until: 'removed',
      sourceLabel: 'storyteller',
    });
    const ann = player({ impaired: true, causes: ['drunk:storyteller'], conditions: [drunk] });
    // Bo is poisoned by a cause with no status row of its own, such as the No Dashii's.
    const bo = player({ id: 'b', name: 'Bo', seat: 1, impaired: true, causes: ['poisoned:No Dashii'] });
    render(<Grimoire view={view([ann, bo])} />);
    expect(screen.getByRole('button', { name: /^Seat 1: / }).getAttribute('title')).toBe('Empath, good, drunk');
    expect(screen.getByRole('button', { name: /^Seat 2: / }).getAttribute('title')).toBe('Empath, good, poisoned');
  });

  it('opens from the seat sheet in place of it', async () => {
    render(<Grimoire view={view([player({})])} />);
    await userEvent.click(screen.getByRole('button', { name: /^Seat 1: / }));
    await userEvent.click(screen.getByRole('button', { name: 'Change character' }));
    expect(screen.getByText('Change character of Ann')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ status' })).toBeNull();
  });
});

describe('game facts and controls', () => {
  it("highlights the ending the rules suggest, from the day or from tonight's review", () => {
    const noDemon = { key: 'no_demon', winner: 'good', reason: 'No Demon is alive.' };
    const glows = () =>
      ['Good wins', 'Evil wins', 'End with no winner'].filter((name) =>
        /suggested/.test(screen.getByRole('button', { name }).className),
      );
    const { unmount } = render(<Grimoire view={view([player({})])} />);
    expect(glows()).toEqual([]);
    unmount();
    render(<Grimoire view={view([player({})], { gameEnd: [noDemon] })} />);
    expect(glows()).toEqual(['Good wins']);
    cleanup();
    const twoLeft = { key: 'two_left', winner: 'evil', reason: 'Only two players are alive.' };
    render(<Grimoire view={view([player({})], { review: { gameEnd: [twoLeft] } })} />);
    expect(glows()).toEqual(['Evil wins']);
  });

  it('lists the setup fields in words', () => {
    const field = {
      abilityId: 'f',
      field: 'redHerring',
      title: 'Red herring',
      kind: 'player',
      options: [],
      value: 'b',
      suggestible: true,
    };
    render(<Grimoire view={view([], { setup: { bluffs: ['slayer'], fields: [field] } })} />);
    expect(screen.getByText('Red herring: Bo')).toBeTruthy();
    expect(screen.getByText('Demon bluffs: Slayer')).toBeTruthy();
  });

  it('New game (erase) is a hold button', () => {
    render(<NewGameButton />);
    expect(screen.getByText(/Settings are kept/)).toBeTruthy();
    hold('New game (erase)');
    expect(run).toHaveBeenCalledWith({ type: 'new_game' });
  });
});
