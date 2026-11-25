// The Day tab.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayActionSpec, type StorytellerView } from '@ct/protocol';
import { ability, console_, player } from '../views';

const run = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
// The catalog the panels look types up in: one Townsfolk and one Traveller.
const catalog = vi.hoisted(() => [
  { roleId: 'empath', name: 'Empath', type: 'townsfolk' },
  { roleId: 'beggar', name: 'Beggar', type: 'traveller' },
]);
vi.mock('../../src/app/store', () => ({
  useCommand: () => ({ run, pending: false }),
  useGame: () => ({ catalog, jinxes: [] }),
  useNames: () => ({ players: { aaaaaaaaaaaaaaaa: 'Ann', bbbbbbbbbbbbbbbb: 'Bo' }, roles: {} }),
}));

import { Day, DayAction, Usage } from '../../src/storyteller/Day';

afterEach(() => {
  cleanup();
  run.mockClear();
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
    fields: [{ kind: 'player', label: 'Player', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
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
    await userEvent.selectOptions(screen.getByLabelText('Player'), 'bbbbbbbbbbbbbbbb');
    expect(accept.disabled).toBe(false);
    await userEvent.click(accept);
    expect(run).toHaveBeenCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'choose',
      values: ['bbbbbbbbbbbbbbbb'],
      mode: 'accept',
    });
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

  it('lists every event under "Day events" in the order of a day', () => {
    const flowergirl = spec({ order: 110, recorded: ['yes'] });
    const shot = spec({
      key: 'k2',
      title: 'Slayer (Ann)',
      action: 'shoot',
      preview: true,
      order: 30,
      fields: [{ kind: 'player', label: 'Target', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
    });
    render(<Day view={dayView({ dayActions: [flowergirl, shot] })} />);
    const events = within(section('Day events')).getAllByRole('article');
    expect(events.map((e) => within(e).getByRole('heading').textContent)).toEqual(['Slayer (Ann)', 'Flowergirl (Ann)']);
    expect((screen.getByLabelText('Flowergirl (Ann)') as HTMLSelectElement).value).toBe('yes');
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
      fields: [{ kind: 'player', label: 'Target', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
    });
    const { rerender } = render(<Day view={dayView({ dayActions: [moonchild] })} />);
    expect(screen.queryByText(/Needed tonight|Review/)).toBeNull();
    rerender(<Day view={dayView({ dayActions: [{ ...moonchild, recorded: ['bbbbbbbbbbbbbbbb'] }] })} />);
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
      recorded: ['bbbbbbbbbbbbbbbb'],
      fields: [{ kind: 'player', label: 'Cursed', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
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
      values: ['aaaaaaaaaaaaaaaa'],
      mode: 'accept',
    });
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull();
  });

  it('rows: Add records a complete new row with the others, and one can be removed', async () => {
    // No role uses rows on the Day tab now (the Juggler enters their own guesses at night); the control stays.
    const guesser = spec({
      title: 'Guesser (Ann)',
      action: 'guesses',
      control: 'rows',
      maxRows: 5,
      recorded: ['aaaaaaaaaaaaaaaa', 'empath'],
      fields: [
        { kind: 'player', label: 'Player', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] },
        { kind: 'role', label: 'Character', options: ['empath', 'beggar'] },
      ],
    });
    render(<Day view={dayView({ dayActions: [guesser] })} />);
    expect((screen.getByLabelText('Player 1') as HTMLSelectElement).value).toBe('aaaaaaaaaaaaaaaa');
    await userEvent.selectOptions(screen.getByLabelText('Player 2'), 'bbbbbbbbbbbbbbbb');
    expect(run).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Character 2'), 'beggar');
    expect(run).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'guesses',
      values: ['aaaaaaaaaaaaaaaa', 'empath', 'bbbbbbbbbbbbbbbb', 'beggar'],
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
      fields: [{ kind: 'player', label: 'Target', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
    });
    run.mockResolvedValueOnce({ ok: true, data: { summary: 'Bo is not the Demon: nothing happens.' } } as never);
    render(<Day view={dayView({ dayActions: [shot] })} />);
    const select = screen.getByLabelText('Slayer (Ann)') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.options[0]?.text).toBe('No one');
    const use = screen.getByRole('button', { name: 'Use' }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    await userEvent.selectOptions(select, 'bbbbbbbbbbbbbbbb');
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'shoot',
      values: ['bbbbbbbbbbbbbbbb'],
      mode: 'preview',
    });
    expect(await screen.findByText('Bo is not the Demon: nothing happens.')).toBeTruthy();
    await userEvent.click(use);
    expect(run).toHaveBeenLastCalledWith({
      type: 'day_action',
      abilityId: 'a1',
      action: 'shoot',
      values: ['bbbbbbbbbbbbbbbb'],
      mode: 'accept',
    });
  });

  it('a confirmed Now event shows its choice, locked, and Use again takes it back', async () => {
    const shot = spec({
      title: 'Slayer (Ann)',
      action: 'shoot',
      preview: true,
      clearable: true,
      recorded: ['bbbbbbbbbbbbbbbb'],
      fields: [{ kind: 'player', label: 'Target', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
    });
    render(<Day view={dayView({ dayActions: [shot] })} />);
    const select = screen.getByLabelText('Slayer (Ann)') as HTMLSelectElement;
    expect(select.value).toBe('bbbbbbbbbbbbbbbb');
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
    await userEvent.selectOptions(screen.getByLabelText('Executed'), 'aaaaaaaaaaaaaaaa');
    expect(run).toHaveBeenCalledWith({ type: 'record_execution', playerId: 'aaaaaaaaaaaaaaaa', died: true });
    const chosen = (playerId: string | null) =>
      ({ at: 'Day 2', kind: 'execution', text: '', playerId }) as StorytellerView['dayEvents'][number];
    rerender(<Day view={dayView({ dayEvents: [chosen('aaaaaaaaaaaaaaaa')] })} />);
    expect((screen.getByLabelText('Executed') as HTMLSelectElement).value).toBe('aaaaaaaaaaaaaaaa');
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
          player({ id: 'aaaaaaaaaaaaaaaa', alive: true }),
          player({ id: 'bbbbbbbbbbbbbbbb', name: 'Bo', seat: 1, alive: false }),
          player({ id: 'cccccccccccccccc', name: 'Cy', seat: 2, alive: false, ghostVoteUsed: true }),
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
        ability({ id: 'a91', name: 'Virgin', oncePerGame: false, reminder: 'First nomination.', dayReminder: true }),
        ability({ id: 'a92', name: 'Mayor', reminder: 'Three alive.', dayReminder: true, active: false }),
        ability({ id: 'a93', name: 'Empath', reminder: 'Night only.' }),
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
