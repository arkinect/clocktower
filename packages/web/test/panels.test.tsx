// The console and phone parts that decide what a person reads. Views are built by hand: the web never imports the rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AbilityView,
  ConditionView,
  DayActionSpec,
  GrimoirePlayer,
  Jinx,
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

import { Ended } from '../src/player/PlayerApp';
import { RoleCardView, RoleList, typeName } from '../src/player/parts';
import { DayAction, Usage } from '../src/storyteller/Day';
import { AssignRow, Field } from '../src/storyteller/Setup';
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
    ['drunk:Drunk', 'Drunk/Marionette (own role)'],
    ['drunk:Marionette', 'Drunk/Marionette (own role)'],
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

  it('shows a reminder only while the ability works', () => {
    render(
      <Usage
        seated={seated([
          ability({ id: 'b', name: 'Virgin', oncePerGame: false, reminder: 'First nomination.' }),
          ability({ id: 'c', name: 'Mayor', oncePerGame: false, reminder: 'Three alive.', active: false }),
        ])}
      />,
    );
    expect(screen.getByText(/First nomination/)).toBeTruthy();
    expect(screen.queryByText(/Three alive/)).toBeNull();
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
  const setupView = { setup: { believedOptions: {} }, script: ['empath', 'beggar'] } as unknown as StorytellerView;

  it("asks for a Traveller's alignment", () => {
    render(<AssignRow view={setupView} player={player({ character: 'beggar' })} />);
    expect(screen.getByLabelText('Alignment of Ann')).toBeTruthy();
  });

  it('leaves every other character on its natural alignment', () => {
    render(<AssignRow view={setupView} player={player({ character: 'empath' })} />);
    expect(screen.queryByLabelText('Alignment of Ann')).toBeNull();
    expect(screen.getByLabelText('Character for Ann')).toBeTruthy();
  });
});
