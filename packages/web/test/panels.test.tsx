// The console and phone parts that decide what a person reads. Views are built by hand: the web never imports the rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AbilityView,
  ConditionView,
  DayActionSpec,
  GrimoirePlayer,
  Jinx,
  ReviewItem,
  ReviewView,
  RoleCard,
  SetupFieldSpec,
  type PlayerView,
  type StorytellerView,
} from '@ct/protocol';

const run = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
// The catalog the panels look types up in: one Townsfolk and one Traveller.
const catalog = vi.hoisted(() => [
  { roleId: 'empath', name: 'Empath', type: 'townsfolk' },
  { roleId: 'beggar', name: 'Beggar', type: 'traveller' },
]);
vi.mock('../src/app/store', () => ({
  useCommand: () => ({ run, pending: false }),
  useGame: () => ({ catalog, jinxes: [] }),
  useNames: () => ({ players: { a: 'Ann', b: 'Bo' }, roles: {} }),
}));

// The idle games are not under test: the night screen only needs something to put in their place.
vi.mock('../src/games/NightGames', () => ({ default: () => null }));

import { Ended, Night } from '../src/player/PlayerApp';
import { RoleCardView, RoleList, typeName } from '../src/player/parts';
import { Day, DayAction, Usage } from '../src/storyteller/Day';
import { Review } from '../src/storyteller/Review';
import { AssignRow, Field, Settings, TypeCounts, countsHint } from '../src/storyteller/Setup';
import { InputSheet, causeLabel, causesWithoutRow, phaseText } from '../src/storyteller/common';
import { HoldButton, UpdateBar } from '../src/ui/ui';

afterEach(() => {
  cleanup();
  run.mockClear();
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

const condition = (over: Record<string, unknown>) =>
  ConditionView.parse({
    id: 'c',
    type: 'poisoned',
    name: null,
    label: 'poisoned',
    until: 'dusk',
    sourceLabel: 'Poisoner',
    ...over,
  });

const player = (over: Record<string, unknown>) =>
  GrimoirePlayer.parse({
    id: 'a',
    name: 'Ann',
    seat: 0,
    alive: true,
    deathCause: null,
    character: null,
    alignment: 'good',
    self: { character: null, alignment: 'good' },
    abilities: [],
    conditions: [],
    impaired: false,
    causes: [],
    ghostVoteUsed: false,
    hasSeenRole: false,
    rolePreference: 'none',
    connected: true,
    departed: false,
    isDemon: false,
    ...over,
  });

const console_ = (over: Partial<StorytellerView['phase']>, players: GrimoirePlayer[] = []) =>
  ({
    players,
    phase: { kind: 'day', n: 1, stage: null, deadline: null, winner: null, endedReason: null, ...over },
  }) as Pick<StorytellerView, 'players' | 'phase'> as StorytellerView;

const card = RoleCard.parse({
  roleId: 'empath',
  name: 'Empath',
  type: 'townsfolk',
  abilityText: 'Each night, you learn how many of your 2 alive neighbors are evil.',
  reminder: null,
  firstNight: 1,
  otherNight: 1,
});

describe('phase and type names', () => {
  it.each([
    [{ kind: 'night', n: 2, stage: 'review' }, 'Night 2: review'],
    [{ kind: 'day', n: 3 }, 'Day 3'],
    [{ kind: 'lobby', n: 0 }, 'Lobby'],
    [{ kind: 'setup', n: 0 }, 'Setup'],
    [{ kind: 'ended', n: 4 }, 'Game over'],
  ] as const)('%o reads as %s', (phase, text) => {
    expect(phaseText(console_(phase))).toBe(text);
  });

  it('names one of each type', () => {
    expect(
      ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map((t) => typeName(t as RoleCard['type'])),
    ).toEqual(['Townsfolk', 'Outsider', 'Minion', 'Demon', 'Traveller']);
  });
});

describe('impairment wording', () => {
  it.each([
    ['poisoned:Poisoner', 'Poisoned by the Poisoner'],
    ['drunk:Sailor', 'Drunk by the Sailor'],
    ['drunk:storyteller', 'Drunk (set by you)'],
    ['poisoned:storyteller', 'Poisoned (set by you)'],
    ['drunk:Drunk', 'drunk (own role)'],
    ['drunk:Marionette', 'drunk (own role)'],
  ])('%s reads as %s', (cause, text) => {
    expect(causeLabel(cause)).toBe(text);
  });

  it('leaves out a cause the conditions list already shows', () => {
    const p = player({
      impaired: true,
      causes: ['poisoned:Poisoner', 'drunk:storyteller', 'poisoned:No Dashii'],
      conditions: [condition({}), condition({ id: 'd', type: 'drunk', sourceLabel: 'Storyteller' })],
    });
    expect(causesWithoutRow(p)).toEqual(['poisoned:No Dashii']);
  });
});

describe('ability tracker', () => {
  const seated = (abilities: unknown[]) => [player({ abilities })];

  it('gives a believed role no row and no reminder', () => {
    render(<Usage seated={seated([ability({ perceivedOnly: true, roleId: 'virgin', reminder: 'Believed.' })])} />);
    expect(screen.queryByText(/Slayer/)).toBeNull();
    expect(screen.queryByText(/Believed/)).toBeNull();
  });

  it('lists a role gained during the game', () => {
    render(<Usage seated={seated([ability({ origin: 'granted', name: 'Fisherman' })])} />);
    expect(screen.getByRole('checkbox', { name: /Fisherman, Ann/ })).toBeTruthy();
  });

  it('a tracked ability has no checkbox to change', () => {
    render(<Usage seated={seated([ability({ usageAuto: true })])} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('tracked automatically')).toBeTruthy();
  });

  it('a manual one sends the change', async () => {
    render(<Usage seated={seated([ability({ id: 'a7' })])} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(run).toHaveBeenCalledWith({ type: 'set_ability_used', abilityId: 'a7', used: true });
  });
});

describe('day actions', () => {
  const spec = DayActionSpec.parse({
    key: 'k',
    roleId: 'cannibal',
    title: 'Who the Cannibal becomes',
    prompt: 'Choose',
    fields: [{ kind: 'player', label: 'Player', options: ['a', 'b'] }],
    distinct: false,
    allowDecline: false,
    abilityId: 'a1',
    action: 'choose',
    preview: false,
    recorded: null,
    neededTonight: false,
  });

  it('cannot be applied until something is chosen', async () => {
    render(<DayAction view={console_({}, [player({})])} spec={spec} />);
    const accept = screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Player'), 'b');
    expect(accept.disabled).toBe(false);
    await userEvent.click(accept);
    expect(run).toHaveBeenCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'choose',
      values: ['b'],
      mode: 'accept',
    });
  });
});

describe('setup fields', () => {
  const field = SetupFieldSpec.parse({
    abilityId: 'a1',
    field: 'outsiders',
    title: 'Outsider change',
    kind: 'option',
    options: [{ id: '+1', label: '+1 Outsider' }],
    value: '+1',
    suggestible: false,
  });

  it('offers only what the rules sent, and shows the value they sent', () => {
    render(<Field spec={field} />);
    const select = screen.getByRole('combobox', { name: 'Outsider change' }) as HTMLSelectElement;
    expect(select.value).toBe('+1');
    expect(within(select).queryByText('-1 Outsider')).toBeNull();
  });

  it('a suggestion button appears only where a suggestion exists', () => {
    render(<Field spec={field} />);
    expect(screen.queryByRole('button', { name: 'Suggest' })).toBeNull();
    cleanup();
    render(<Field spec={{ ...field, suggestible: true }} />);
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeTruthy();
  });
});

describe('the small sheet for typed values', () => {
  const sheet = (onSave: (v: string) => Promise<{ ok: boolean }>, onClose = vi.fn()) => {
    render(<InputSheet title="Rename" label="Name" initial="Ann" onSave={onSave} onClose={onClose} />);
    return onClose;
  };

  it('opens filled in, with Cancel before Save', () => {
    sheet(vi.fn());
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ann');
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf('Save'));
  });

  it('saves the trimmed text and closes', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    const onClose = sheet(save);
    const input = screen.getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, '  Bo {Enter}');
    expect(save).toHaveBeenCalledWith('Bo');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open when the save is refused, and cannot save nothing', async () => {
    const onClose = sheet(async () => ({ ok: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Name'));
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('labels and cards that keep their size', () => {
  it('the hold button keeps both labels in place and shows one', async () => {
    render(<HoldButton onConfirm={vi.fn()}>End the game</HoldButton>);
    const button = screen.getByRole('button', { name: 'End the game' });
    const [idle, armed] = Array.from(button.querySelectorAll('span span'));
    expect(idle?.textContent).toBe('End the game');
    expect(armed?.textContent).toBe('Cancel');
    expect(armed?.getAttribute('aria-hidden')).toBe('true');
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(button);
    expect(idle?.getAttribute('aria-hidden')).toBe('true');
    expect(armed?.getAttribute('aria-hidden')).toBeNull();
  });

  it('the role card keeps everything secret out of the page until it is revealed', async () => {
    render(<RoleCardView role={card} secret={<p>Your fellow Minions: Bo</p>} />);
    expect(screen.queryByText('Your fellow Minions: Bo')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tap to reveal your role' }));
    expect(screen.getByText('Your fellow Minions: Bo')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Tap to hide/ }));
    expect(screen.queryByText('Your fellow Minions: Bo')).toBeNull();
  });

  it('the role card keeps both faces and shows one', async () => {
    render(<RoleCardView role={card} />);
    const button = screen.getByRole('button', { name: 'Tap to reveal your role' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const faces = Array.from(button.children);
    expect(faces).toHaveLength(2);
    expect(faces.map((f) => f.getAttribute('aria-hidden'))).toEqual(['true', null]);
    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(faces.map((f) => f.getAttribute('aria-hidden'))).toEqual([null, 'true']);
  });

  it('a player with no role yet sees that, and no button', () => {
    render(<RoleCardView role={null} />);
    expect(screen.getByText('No role yet.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('the update bar', () => {
  it('Dismiss hides it', async () => {
    render(<UpdateBar />);
    expect(screen.getByText(/A new version is ready/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/A new version is ready/)).toBeNull();
  });

  it('Reload reloads the page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    render(<UpdateBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('the role list', () => {
  const list: RoleCard[] = [card, RoleCard.parse({ ...card, roleId: 'imp', name: 'Imp', type: 'demon' })];
  const jinxes = [Jinx.parse({ a: 'empath', b: 'imp', text: 'They do not get along.' })];

  it('shows a jinx when both roles are on the script', () => {
    render(<RoleList script={['empath', 'imp']} catalog={list} jinxes={jinxes} />);
    expect(screen.getByRole('heading', { name: 'Jinxes' })).toBeTruthy();
    expect(screen.getByText(/They do not get along/)).toBeTruthy();
  });

  it('has no Jinxes section otherwise', () => {
    render(<RoleList script={['empath']} catalog={list} jinxes={jinxes} />);
    expect(screen.queryByRole('heading', { name: 'Jinxes' })).toBeNull();
  });

  it('says so before a script is chosen', () => {
    render(<RoleList script={[]} catalog={list} jinxes={[]} />);
    expect(screen.getByText(/has not chosen a script/)).toBeTruthy();
  });
});

describe('the end of the game on a phone', () => {
  const view = (endedReason: 'update' | 'storyteller' | null, winner: 'good' | 'evil' | null = null) =>
    ({
      phase: { kind: 'ended', n: 1, stage: null, deadline: null, winner, endedReason },
      me: { name: 'Ann', messages: [] },
    }) as Pick<PlayerView, 'phase'> & { me: Pick<PlayerView['me'], 'name' | 'messages'> } as PlayerView;

  it('says when an update ended it', () => {
    render(<Ended view={view('update')} />);
    expect(screen.getByText('The game ended for an app update.')).toBeTruthy();
  });

  it('says nothing about updates otherwise', () => {
    render(<Ended view={view('storyteller', 'evil')} />);
    expect(screen.queryByText(/app update/)).toBeNull();
    expect(screen.getByText('Evil wins.')).toBeTruthy();
  });
});

describe('setup assignment', () => {
  const setupView = {
    setup: { believedOptions: {}, fields: [] },
    script: ['empath', 'beggar'],
  } as unknown as StorytellerView;

  it("asks for a Traveller's alignment", () => {
    render(<AssignRow view={setupView} player={player({ character: 'beggar' })} />);
    expect(screen.getByLabelText('Alignment of Ann')).toBeTruthy();
  });

  it('leaves every other character on its natural alignment', () => {
    render(<AssignRow view={setupView} player={player({ character: 'empath' })} />);
    expect(screen.queryByLabelText('Alignment of Ann')).toBeNull();
    expect(screen.getByLabelText('Character for Ann')).toBeTruthy();
  });

  it("puts a field tied to the player (Lil' Monsta's Minion) in their row", async () => {
    const field = SetupFieldSpec.parse({
      abilityId: 'lm',
      field: 'minion',
      title: "The Minion the Lil' Monsta player becomes",
      kind: 'role',
      options: [{ id: 'empath', label: 'Empath' }],
      value: null,
      suggestible: false,
      row: { playerId: 'a', label: 'plays as' },
    });
    const v = { ...setupView, setup: { ...setupView.setup, fields: [field] } } as StorytellerView;
    render(<AssignRow view={v} player={player({ character: 'empath' })} />);
    await userEvent.selectOptions(screen.getByLabelText('Ann plays as'), 'empath');
    expect(run).toHaveBeenCalledWith({ type: 'set_setup_field', abilityId: 'lm', field: 'minion', value: 'empath' });
    cleanup();
    render(<AssignRow view={v} player={player({ id: 'b', name: 'Bo', character: 'empath' })} />);
    expect(screen.queryByLabelText('Bo plays as')).toBeNull();
  });
});

describe('the Day tab', () => {
  const spec = (over: Record<string, unknown>) =>
    DayActionSpec.parse({
      key: 'k',
      roleId: null,
      title: 'Flowergirl (Ann)',
      prompt: 'Did a Demon vote today?',
      fields: [{ kind: 'option', label: 'Demon voted', options: ['no', 'yes'], labels: { yes: 'Yes', no: 'No' } }],
      distinct: false,
      allowDecline: false,
      abilityId: 'a1',
      action: 'demon_voted',
      preview: false,
      recorded: null,
      neededTonight: false,
      ...over,
    });
  const dayView = (over: Partial<StorytellerView> = {}, players = [player({ alive: true })]) =>
    ({
      ...console_({ kind: 'day', n: 2 }, players),
      dayActions: [],
      dayEvents: [],
      gameEnd: [],
      prompts: [],
      dayNotices: [],
      notes: '',
      ...over,
    }) as StorytellerView;
  const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;

  it('shows no nomination, vote or statement controls, and starts the matching night', () => {
    render(<Day view={dayView()} />);
    expect(screen.queryByText(/Nominat|Votes|Statement/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Night 2' })).toBeTruthy();
  });

  it('lists every event under "Day events" in the order of a day, with no Now or Tonight tag', () => {
    const flowergirl = spec({ order: 110, recorded: ['yes'] });
    const shot = spec({
      key: 'k2',
      title: 'Slayer (Ann)',
      action: 'shoot',
      preview: true,
      order: 30,
      fields: [{ kind: 'player', label: 'Target', options: ['a', 'b'] }],
    });
    render(<Day view={dayView({ dayActions: [flowergirl, shot] })} />);
    const events = within(section('Day events')).getAllByRole('article');
    expect(events.map((e) => within(e).getByRole('heading').textContent)).toEqual(['Slayer (Ann)', 'Flowergirl (Ann)']);
    expect(screen.queryByText('Now')).toBeNull();
    expect(screen.queryByText('Tonight')).toBeNull();
    expect((screen.getByLabelText('Flowergirl (Ann)') as HTMLSelectElement).value).toBe('yes');
    expect(screen.queryByRole('heading', { name: 'Facts for tonight' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Day abilities' })).toBeNull();
  });

  it('a Tonight event shows its default until changed, with no confirm, and sends on change', async () => {
    render(<Day view={dayView({ dayActions: [spec({ default: ['no'], neededTonight: true })] })} />);
    const select = screen.getByLabelText('Flowergirl (Ann)') as HTMLSelectElement;
    expect(select.value).toBe('no');
    expect([...select.options].map((o) => o.text)).toEqual(['No', 'Yes']);
    expect(screen.queryByText(/Needed tonight/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull();
    await userEvent.selectOptions(select, 'yes');
    expect(run).toHaveBeenCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'demon_voted',
      values: ['yes'],
      mode: 'accept',
    });
  });

  it('a Tonight event with no default has no hint, and a clearable one can be set back to no one', async () => {
    const moonchild = spec({
      title: 'Moonchild (Ann)',
      action: 'target',
      blocksNight: true,
      clearable: true,
      emptyLabel: 'Not chosen yet',
      fields: [{ kind: 'player', label: 'Target', options: ['a', 'b'] }],
    });
    const { rerender } = render(<Day view={dayView({ dayActions: [moonchild] })} />);
    expect(screen.queryByText(/Needed tonight|Review/)).toBeNull();
    rerender(<Day view={dayView({ dayActions: [{ ...moonchild, recorded: ['b'] }] })} />);
    await userEvent.selectOptions(screen.getByLabelText('Moonchild (Ann)'), '');
    expect(run).toHaveBeenCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'target',
      values: [],
      mode: 'accept',
    });
  });

  it('a switch sends the other value, and a switch per player sends that player', async () => {
    const gossip = spec({
      title: 'Gossip (Ann)',
      action: 'statement',
      control: 'toggle',
      default: ['false'],
      fields: [
        { kind: 'option', label: 'Statement', options: ['false', 'true'], labels: { true: 'Yes', false: 'No' } },
      ],
    });
    const witch = spec({
      key: 'k2',
      title: 'Witch (Bo)',
      action: 'apply_curse',
      preview: true,
      control: 'toggle',
      recorded: ['b'],
      fields: [{ kind: 'player', label: 'Cursed', options: ['a', 'b'] }],
    });
    render(<Day view={dayView({ dayActions: [gossip, witch] })} />);
    expect(screen.getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('true');
    const statement = screen.getByRole('button', { name: 'Yes' });
    expect(statement.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(statement);
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'statement',
      values: ['true'],
      mode: 'accept',
    });
    expect(screen.getByRole('button', { name: 'Bo' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Ann' }));
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'apply_curse',
      values: ['a'],
      mode: 'accept',
    });
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull();
  });

  it('rows: Add records a complete new row with the others, and one can be removed', async () => {
    const juggler = spec({
      title: 'Juggler (Ann)',
      action: 'guesses',
      control: 'rows',
      maxRows: 5,
      recorded: ['a', 'empath'],
      fields: [
        { kind: 'player', label: 'Player', options: ['a', 'b'] },
        { kind: 'role', label: 'Character', options: ['empath', 'beggar'] },
      ],
    });
    render(<Day view={dayView({ dayActions: [juggler] })} />);
    expect((screen.getByLabelText('Player 1') as HTMLSelectElement).value).toBe('a');
    await userEvent.selectOptions(screen.getByLabelText('Player 2'), 'b');
    expect(run).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Character 2'), 'beggar');
    expect(run).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'guesses',
      values: ['a', 'empath', 'b', 'beggar'],
      mode: 'accept',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'guesses',
      values: [],
      mode: 'accept',
    });
  });

  it('a fact Start Night waits for shows its preselected answer, and holds Start Night only while it has none', () => {
    const fake = spec({
      title: 'Cannibal (Ann)',
      action: 'fake_eat',
      fields: [{ kind: 'role', label: 'Character', options: ['empath', 'slayer'] }],
      blocksNight: true,
      recorded: ['slayer'],
    });
    const { rerender } = render(<Day view={dayView({ dayActions: [fake] })} />);
    const select = screen.getByLabelText('Cannibal (Ann)') as HTMLSelectElement;
    expect(select.value).toBe('slayer');
    expect((screen.getByRole('button', { name: 'Start Night 2' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Force start night' })).toBeNull();
    rerender(<Day view={dayView({ dayActions: [{ ...fake, recorded: null }] })} />);
    expect((screen.getByRole('button', { name: 'Start Night 2' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Force start night' })).toBeTruthy();
  });

  it('a Now event defaults to no one, previews when chosen, and happens on Use', async () => {
    const shot = spec({
      title: 'Slayer (Ann)',
      action: 'shoot',
      preview: true,
      fields: [{ kind: 'player', label: 'Target', options: ['a', 'b'] }],
    });
    run.mockResolvedValueOnce({ ok: true, data: { summary: 'Bo is not the Demon: nothing happens.' } } as never);
    render(<Day view={dayView({ dayActions: [shot] })} />);
    const select = screen.getByLabelText('Slayer (Ann)') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.options[0]?.text).toBe('No one');
    const use = screen.getByRole('button', { name: 'Use' }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    await userEvent.selectOptions(select, 'b');
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'shoot',
      values: ['b'],
      mode: 'preview',
    });
    expect(await screen.findByText('Bo is not the Demon: nothing happens.')).toBeTruthy();
    await userEvent.click(use);
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'shoot',
      values: ['b'],
      mode: 'accept',
    });
  });

  it('a confirmed Now event shows its choice, locked, and Use again takes it back', async () => {
    const shot = spec({
      title: 'Slayer (Ann)',
      action: 'shoot',
      preview: true,
      clearable: true,
      recorded: ['b'],
      fields: [{ kind: 'player', label: 'Target', options: ['a', 'b'] }],
    });
    render(<Day view={dayView({ dayActions: [shot] })} />);
    const select = screen.getByLabelText('Slayer (Ann)') as HTMLSelectElement;
    expect(select.value).toBe('b');
    expect(select.disabled).toBe(true);
    const use = screen.getByRole('button', { name: 'Use' });
    expect(use.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(use);
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'shoot',
      values: [],
      mode: 'accept',
    });
  });

  it('choosing from the list records the execution, which happens at Start Night', async () => {
    const { rerender } = render(<Day view={dayView()} />);
    expect(screen.queryByRole('button', { name: 'Execute' })).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Executed'), 'a');
    expect(run).toHaveBeenCalledWith({ type: 'record_execution', playerId: 'a', died: true });
    const chosen = (playerId: string | null) =>
      ({ at: 'Day 2', kind: 'execution', text: '', playerId }) as StorytellerView['dayEvents'][number];
    rerender(<Day view={dayView({ dayEvents: [chosen('a')] })} />);
    expect((screen.getByLabelText('Executed') as HTMLSelectElement).value).toBe('a');
    expect(screen.getByText('To be executed')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Executed'), '');
    expect(run).toHaveBeenLastCalledWith({ type: 'record_execution', playerId: null, died: true });
    rerender(<Day view={dayView({ dayEvents: [chosen(null)] })} />);
    expect((screen.getByLabelText('Executed') as HTMLSelectElement).value).toBe('');
  });

  it('offers Kill to alive players and Use dead vote to dead ones', () => {
    render(
      <Day
        view={dayView({}, [
          player({ id: 'a', alive: true }),
          player({ id: 'b', name: 'Bo', seat: 1, alive: false }),
          player({ id: 'c', name: 'Cy', seat: 2, alive: false, ghostVoteUsed: true }),
        ])}
      />,
    );
    expect(screen.getByRole('button', { name: 'Kill' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use dead vote' })).toBeTruthy();
    expect(screen.getByText('Dead vote used')).toBeTruthy();
  });

  it('lists day reminders of working abilities under Execution', () => {
    const p = player({
      abilities: [
        ability({ id: 'b', name: 'Virgin', oncePerGame: false, reminder: 'First nomination.', dayReminder: true }),
        ability({ id: 'c', name: 'Mayor', reminder: 'Three alive.', dayReminder: true, active: false }),
        ability({ id: 'd', name: 'Empath', reminder: 'Night only.' }),
      ],
    });
    render(<Day view={dayView({}, [p])} />);
    const execution = section('Execution');
    expect(within(execution).getByText(/First nomination/)).toBeTruthy();
    expect(within(execution).queryByText(/Three alive/)).toBeNull();
    expect(within(execution).queryByText(/Night only/)).toBeNull();
  });

  it('shows no game-end card while they are switched off', () => {
    const gameEnd = [{ key: 'mayor', winner: 'good' as const, reason: 'Only 3 players live.' }];
    render(<Day view={dayView({ gameEnd })} />);
    expect(screen.queryByText(/may have won/)).toBeNull();
  });

  it('shows Travellers when the catalog has one', () => {
    render(<Day view={dayView()} />);
    expect(screen.getByRole('heading', { name: 'Travellers' })).toBeTruthy();
  });
});

describe('the Review tab', () => {
  const decision = (over: Record<string, unknown>) =>
    ReviewItem.parse({
      key: { kind: 'flowergirl_voted', ability: null },
      hash: 'h1',
      title: 'Flowergirl: did a Demon vote on Day 1?',
      description: 'Not recorded during the day.',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      default: 'no',
      chosen: null,
      stale: false,
      required: true,
      ...over,
    });
  const reviewView = (decisions: ReviewItem[]) =>
    ({
      ...console_({ kind: 'night', n: 2, stage: 'review' }),
      review: ReviewView.parse({
        actors: [],
        results: [],
        decisions,
        questions: [],
        notices: [],
        deaths: [],
        revived: [],
        malfunctions: [],
        malfunctionAdjust: { add: [], remove: [] },
        gameEnd: [],
        log: [],
        story: { kind: 'night', n: 2, deaths: [], revived: [], rows: [] },
      }),
    }) as StorytellerView;
  const topCard = () => screen.getByText('Not recorded during the day.', { selector: 'b' }).closest('p')?.parentElement;

  it('keeps an answered required decision in the top card, with no Decisions section or Accept all defaults', () => {
    render(<Review view={reviewView([decision({ chosen: 'yes' })])} />);
    expect(within(topCard() as HTMLElement).getByRole('heading', { name: /Flowergirl/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Decisions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept all defaults' })).toBeNull();
  });

  it('offers Accept all defaults only while an optional decision is undecided', () => {
    const optional = decision({ hash: 'h2', title: 'Imp: who dies?', required: false });
    const { rerender } = render(<Review view={reviewView([optional])} />);
    expect(screen.getByRole('button', { name: 'Accept all defaults' })).toBeTruthy();
    rerender(<Review view={reviewView([{ ...optional, chosen: 'yes' }])} />);
    expect(screen.getByRole('heading', { name: 'Decisions' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept all defaults' })).toBeNull();
  });
});

describe('setup: character type counts', () => {
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, seat) => player({ id, name: id.toUpperCase(), seat }));
  const countsView = (target: number[], source: 'default' | 'override' = 'default') =>
    ({ players: seven, setup: { counts: { target, actual: [0, 0, 0, 0], source } } }) as unknown as StorytellerView;
  const field = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;

  it('holds an edit until the four counts add up to the player count, then sends them together', () => {
    render(<TypeCounts view={countsView([5, 0, 1, 1])} />);
    fireEvent.change(field(/^Townsfolk/), { target: { value: '4' } });
    expect(run).not.toHaveBeenCalled();
    expect(field(/^Townsfolk/).value).toBe('4');
    fireEvent.change(field(/^Outsiders/), { target: { value: '1' } });
    expect(run).toHaveBeenCalledWith({ type: 'set_type_counts', counts: [4, 1, 1, 1] });
  });

  it('sends nothing when an edit is undone', () => {
    render(<TypeCounts view={countsView([5, 0, 1, 1])} />);
    fireEvent.change(field(/^Townsfolk/), { target: { value: '4' } });
    fireEvent.change(field(/^Townsfolk/), { target: { value: '5' } });
    expect(run).not.toHaveBeenCalled();
  });

  it('drops the held edit once the game shows the same counts', () => {
    const { rerender } = render(<TypeCounts view={countsView([5, 0, 1, 1])} />);
    fireEvent.change(field(/^Townsfolk/), { target: { value: '4' } });
    fireEvent.change(field(/^Outsiders/), { target: { value: '1' } });
    rerender(<TypeCounts view={countsView([4, 1, 1, 1], 'override')} />);
    expect(field(/^Townsfolk/).getAttribute('aria-invalid')).toBeNull();
    // A later change by the rules (a Baron, say) now shows, since nothing is held over it.
    rerender(<TypeCounts view={countsView([3, 2, 1, 1], 'override')} />);
    expect(field(/^Outsiders/).value).toBe('2');
  });

  it('drops a held edit when the number of seated players changes', () => {
    const { rerender } = render(<TypeCounts view={countsView([5, 0, 1, 1])} />);
    fireEvent.change(field(/^Townsfolk/), { target: { value: '4' } });
    const eight = { ...countsView([5, 1, 1, 1]), players: [...seven, player({ id: 'h', name: 'H', seat: 7 })] };
    rerender(<TypeCounts view={eight as StorytellerView} />);
    expect(field(/^Townsfolk/).value).toBe('5');
    expect(field(/^Townsfolk/).getAttribute('aria-invalid')).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('has a line for a held edit, which stays off the console while it is switched off', () => {
    expect(countsHint([4, 0, 1, 1], 7)).toBe('Adds up to 6 of 7. Not saved yet.');
    render(<TypeCounts view={countsView([5, 0, 1, 1])} />);
    fireEvent.change(field(/^Townsfolk/), { target: { value: '4' } });
    expect(screen.queryByText(/Not saved yet/)).toBeNull();
  });

  it('Back to the default forgets a held edit', async () => {
    render(<TypeCounts view={countsView([4, 1, 1, 1], 'override')} />);
    fireEvent.change(field(/^Townsfolk/), { target: { value: '2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Back to the default' }));
    expect(run).toHaveBeenCalledWith({ type: 'set_type_counts', counts: null });
    expect(field(/^Townsfolk/).value).toBe('4');
  });
});

describe('setup: countdown settings', () => {
  const settingsView = {
    settings: {
      evilInfoPolicy: 'house',
      countdownSeconds: 120,
      followUpExtensionSeconds: 30,
      announceDeaths: true,
      notifyOnRoleChange: true,
    },
  } as unknown as StorytellerView;
  const leave = (label: string, value: string) => {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    return input;
  };

  it('sends a changed countdown when the field is left', () => {
    render(<Settings view={settingsView} />);
    leave('Night countdown in seconds', '90');
    expect(run).toHaveBeenCalledWith({ type: 'set_settings', countdownSeconds: 90 });
    leave('Extra seconds for a follow-up question', '45');
    expect(run).toHaveBeenLastCalledWith({ type: 'set_settings', followUpExtensionSeconds: 45 });
  });

  it('brings a number the server would refuse inside the range it accepts', () => {
    render(<Settings view={settingsView} />);
    expect(leave('Night countdown in seconds', '5').value).toBe('10');
    expect(run).toHaveBeenLastCalledWith({ type: 'set_settings', countdownSeconds: 10 });
    expect(leave('Night countdown in seconds', '99999').value).toBe('3600');
    expect(run).toHaveBeenLastCalledWith({ type: 'set_settings', countdownSeconds: 3600 });
  });

  it('sends nothing for a field left as it was, or left empty', () => {
    render(<Settings view={settingsView} />);
    leave('Night countdown in seconds', '120');
    expect(leave('Night countdown in seconds', '').value).toBe('120');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('the night on a phone', () => {
  const spec = {
    key: 'k',
    roleId: null,
    title: 'Poisoner',
    prompt: 'Choose a player.',
    fields: [{ kind: 'player', label: 'Player', options: ['a', 'b'] }],
    distinct: false,
    allowDecline: false,
  };
  const nightView = (n: number, submission: Record<string, { values: string[] }> | null) =>
    ({
      deadAtDawn: [],
      serverNow: 0,
      phase: { kind: 'night', n, stage: 'collecting', deadline: null, winner: null, endedReason: null },
      me: { id: 'a', actions: [spec], questions: [], submitted: submission !== null, submission },
    }) as unknown as PlayerView;
  const chosen = () => (screen.getByLabelText('Player') as HTMLSelectElement).value;

  it('Change opens on what was submitted, on a phone that has just reloaded too', async () => {
    render(<Night view={nightView(1, { k: { values: ['b'] } })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(chosen()).toBe('b');
  });

  it('a new night starts with nothing chosen', async () => {
    const { rerender } = render(<Night view={nightView(1, { k: { values: ['b'] } })} />);
    rerender(<Night view={nightView(2, null)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Night action' }));
    expect(chosen()).toBe('');
  });
});
