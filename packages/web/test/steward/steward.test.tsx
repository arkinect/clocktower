// The steward's console. Views are built by hand: the web never imports the rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerId, PlayerView, RoleCard, RoleId, StewardView } from '@ct/protocol';

const { run, navigate, state } = vi.hoisted(() => ({
  run: vi.fn(async (_command: unknown) => ({ ok: true })),
  navigate: vi.fn(),
  state: { catalog: [] as unknown[] },
}));
vi.mock('../../src/app/router', () => ({ navigate }));
vi.mock('../../src/app/store', () => ({
  useGame: () => ({ catalog: state.catalog, jinxes: [] }),
  useCommand: () => ({ run, pending: false }),
  useNames: () => ({ players: {}, roles: { imp: 'Imp', artist: 'Artist', empath: 'Empath' } }),
}));

import { MyRole, TableNotes } from '../../src/player/autoplay';
import Console from '../../src/steward/Console';
import { nominationWarnings, voteWarnings } from '../../src/steward/Day';
import { AutoplayToggle } from '../../src/storyteller/Setup';

const id = (s: string) => s as PlayerId;
const role = (s: string) => s as RoleId;
const card = (roleId: string, extra: Partial<RoleCard> = {}) =>
  ({
    roleId,
    name: roleId[0]?.toUpperCase() + roleId.slice(1),
    type: 'townsfolk',
    abilityText: '…',
    ...extra,
  }) as RoleCard;

const me = (over: Partial<PlayerView['me']> = {}, stage: PlayerView['phase']['stage'] = null): PlayerView =>
  ({
    kind: 'player',
    serverNow: 0,
    phase: { kind: 'night', n: 1, stage, deadline: null, winner: null, endedReason: null },
    steward: id('ann'),
    deadAtDawn: [],
    players: [],
    me: {
      id: id('ann'),
      alive: true,
      hasSeenRole: false,
      role: card('empath'),
      grants: [],
      messages: [],
      actions: [],
      questions: [],
      submitted: false,
      ...over,
    },
  }) as unknown as PlayerView;

const player = (name: string, seat: number, over = {}) => ({
  id: id(name.toLowerCase()),
  name,
  seat,
  connected: true,
  away: false,
  alive: true,
  votesLeft: true,
  ...over,
});

const DAY: NonNullable<StewardView['day']> = {
  nominations: [],
  block: null,
  needed: 2,
  claims: [
    {
      roleId: role('slayer'),
      claim: 'shot',
      title: 'Slayer shot',
      fields: ['Who shoots', 'At'],
      confirm: '{0} shoots {1}',
    },
  ],
  claimed: [],
  executionQuestions: [],
  closed: false,
};

const view = (kind: StewardView['phase']['kind'], over: Partial<StewardView> = {}): StewardView => ({
  kind: 'steward',
  code: 'ABCD',
  meId: id('ann'),
  serverNow: Date.now(),
  phase: { kind, n: 1, stage: kind === 'night' ? 'collecting' : null, deadline: null, winner: null, endedReason: null },
  me: me(),
  settings: { countdownSeconds: 300, followUpExtensionSeconds: 120, announceDeaths: false, evilInfoPolicy: 'house' },
  players: [player('Ann', 0), player('Bo', 1), player('Cy', 2, { alive: false, votesLeft: false })],
  script: [role('empath')],
  dropped: [],
  seatingPublished: false,
  setup: { counts: [3, 0, 1, 1], source: 'default', fit: [] },
  seenRole: null,
  night: null,
  day: kind === 'day' ? DAY : null,
  tell: [],
  over: null,
  offered: null,
  publicStory: [],
  revealed: null,
  ...over,
});

const NIGHT: NonNullable<StewardView['night']> = {
  notDone: 2,
  names: null,
  closed: false,
  dawnAt: null,
  dawn: null,
  canSkip: false,
  stuck: false,
};

const show = (v: StewardView, tab: string) => render(<Console view={v} tab={tab} />);
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const sent = () => run.mock.calls.map(([c]) => c);

beforeEach(() => {
  state.catalog = [card('empath'), card('imp', { type: 'demon' }), card('artist', { notInAutoplay: 'Needs a judge.' })];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  run.mockClear();
  navigate.mockClear();
});

describe('the tabs', () => {
  const strip = () =>
    within(screen.getByRole('navigation', { name: 'Console sections' }))
      .getAllByRole('link')
      .map((a) => a.textContent);

  it('has no Review or Grimoire, and no Log until the game has ended', () => {
    const { unmount } = show(view('day'), 'reference');
    expect(strip()).toEqual(['Lobby', 'Setup', 'Night', 'Day', 'Table', 'Actions', 'My role', 'Story', 'Reference']);
    unmount();
    show(view('ended'), 'reference');
    expect(strip()).toContain('Log');
  });

  it('follows the game to its next phase', () => {
    const { rerender } = show(view('day'), 'day');
    rerender(<Console view={view('night', { night: NIGHT })} tab="day" />);
    expect(navigate).toHaveBeenCalledWith('/g/ABCD/steward/night');
  });

  it('can only announce a game that is decided', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show(view('day', { over: { winner: 'evil' } }), 'day');
    expect(screen.getByText(/Evil wins/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nominate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'No one' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Slayer shot' })).toBeNull();
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(button(/Announce/));
    await vi.advanceTimersByTimeAsync(3500);
    expect(sent()).toEqual([{ type: 'announce_end' }]);
  });
});

describe('setup', () => {
  it('says whether the script fits, and holds the deal back until it does', () => {
    show(view('setup', { setup: { counts: [3, 0, 1, 1], source: 'default', fit: ['Not enough Minions.'] } }), 'setup');
    expect(screen.getByText(/Not enough Minions/)).toBeTruthy();
    expect(button(/Deal characters/).disabled).toBe(true);
  });

  it('greys out a role autoplay cannot use, with the reason, and leaves it out of All roles', async () => {
    show(view('setup'), 'setup');
    expect((screen.getByRole('checkbox', { name: 'Artist' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Artist: Needs a judge.')).toBeTruthy();
    await userEvent.click(button('All roles'));
    expect(sent()).toEqual([{ type: 'steward_script', roleIds: ['empath', 'imp'] }]);
  });

  it('imports a script without the roles autoplay cannot use, saying which', async () => {
    show(view('setup'), 'setup');
    // jsdom's File has no text().
    const file = Object.assign(new File([], 'script.json', { type: 'application/json' }), {
      text: () => Promise.resolve(JSON.stringify(['imp', 'artist'])),
    });
    await userEvent.upload(screen.getByLabelText('Script file'), file);
    expect(await screen.findByText('Left out, as autoplay cannot use them: Artist.')).toBeTruthy();
    await userEvent.click(button('Apply'));
    expect(sent()).toEqual([{ type: 'steward_script', roleIds: ['imp'] }]);
  });

  it('never says how many of a type are assigned', () => {
    show(view('setup'), 'setup');
    expect(screen.queryByText(/assigned/)).toBeNull();
  });
});

describe('the night', () => {
  it('shows one number, and names only when they are sent', () => {
    const { rerender } = show(view('night', { night: NIGHT }), 'night');
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('Bo')).toBeNull();
    rerender(<Console view={view('night', { night: { ...NIGHT, names: [id('bo')] } })} tab="night" />);
    expect(screen.getByText('Bo')).toBeTruthy();
    expect(button(/Skip/)).toBeTruthy();
  });

  it('offers dawn only when it is ready', async () => {
    const closed = { ...NIGHT, notDone: 0, closed: true, dawnAt: 0 };
    const { rerender } = show(view('night', { night: { ...closed, dawn: 'waiting' } }), 'night');
    expect(button('Call dawn').disabled).toBe(true);
    rerender(<Console view={view('night', { night: { ...closed, dawn: 'ready' } })} tab="night" />);
    await userEvent.click(button('Call dawn'));
    expect(sent()).toEqual([{ type: 'call_dawn' }]);
  });

  it('says only that the steward’s own turn is on Actions', () => {
    const spec = { key: 'k', title: 'Empath', prompt: 'Choose a player.', fields: [], distinct: false };
    const mine = me({ actions: [spec] as unknown as PlayerView['me']['actions'] }, 'collecting');
    const { rerender } = show(view('night', { night: NIGHT, me: mine }), 'night');
    expect(screen.getByText(/Yours is on Actions/)).toBeTruthy();
    expect(screen.queryByText('Choose a player.')).toBeNull();
    rerender(<Console view={view('night', { night: NIGHT, me: me() })} tab="night" />);
    expect(screen.queryByText(/Yours is on Actions/)).toBeNull();
  });

  it('offers a retry when it is stuck, and no cause', () => {
    show(view('night', { night: { ...NIGHT, stuck: true } }), 'night');
    expect(screen.getByText('The app could not finish the night')).toBeTruthy();
    expect(button('Try again')).toBeTruthy();
  });
});

describe('the day', () => {
  const seat = (group: string, name: string) =>
    within(screen.getByRole('group', { name: group })).getByRole('button', { name: new RegExp(name) });

  it('records a nomination after a check, with the public rules as warnings', async () => {
    show(view('day'), 'day');
    await userEvent.click(button('Nominate'));
    await userEvent.click(seat('Nominator', 'Cy'));
    await userEvent.click(seat('Nominee', 'Bo'));
    expect(screen.getByText(/Cy is dead/)).toBeTruthy();
    expect(sent()).toEqual([]);
    await userEvent.click(button('Record'));
    expect(sent()).toEqual([{ type: 'nominate', nominator: 'cy', nominee: 'bo' }]);
  });

  it('counts the votes round the circle', async () => {
    const x = { id: 4, nominator: id('ann'), nominee: id('bo'), lines: [], vote: null, canUndo: true };
    show(view('day', { day: { ...DAY, nominations: [x] } }), 'day');
    await userEvent.click(button('Count the votes'));
    await userEvent.click(seat('Voters', 'Ann'));
    await userEvent.click(seat('Voters', 'Bo'));
    await userEvent.click(seat('Voters', 'Cy'));
    expect(screen.getByText(/Cy has no vote left/)).toBeTruthy();
    await userEvent.click(seat('Voters', 'Bo'));
    await userEvent.click(button('Record 2 votes'));
    expect(sent()).toEqual([{ type: 'count_vote', id: 4, voters: ['ann', 'cy'] }]);
  });

  it('warns of a second nomination, and not of a vote being corrected', () => {
    const x = {
      id: 1,
      nominator: id('ann'),
      nominee: id('bo'),
      lines: [],
      vote: { voters: [id('cy')], needed: 2 },
      canUndo: false,
    };
    const v = view('day', { day: { ...DAY, nominations: [x] } });
    expect(nominationWarnings(v, id('ann'), id('bo'))).toHaveLength(2);
    expect(nominationWarnings(v, id('bo'), id('ann'))).toEqual([]);
    expect(voteWarnings(v, x, [id('cy')])).toEqual([]);
  });

  it('records a claim by anyone, after a plain check', async () => {
    show(view('day'), 'day');
    await userEvent.click(button('Slayer shot'));
    await userEvent.selectOptions(screen.getByLabelText('Who shoots'), 'cy');
    await userEvent.selectOptions(screen.getByLabelText('At'), 'bo');
    await userEvent.click(button('Next'));
    expect(screen.getByRole('dialog', { name: 'Cy shoots Bo?' })).toBeTruthy();
    expect(sent()).toEqual([]);
    await userEvent.click(button('Record'));
    expect(sent()).toEqual([{ type: 'make_claim', roleId: 'slayer', claim: 'shot', values: ['cy', 'bo'] }]);
  });

  it('preselects the block for the execution, and asks the script’s questions of it', async () => {
    const asked = { roleId: role('psychopath'), question: 'Did they win roshambo?' };
    const day = { ...DAY, block: { playerId: id('bo'), votes: 2 }, executionQuestions: [asked] };
    show(view('day', { day }), 'day');
    await userEvent.click(button('Execute Bo'));
    expect(button('Execute').disabled).toBe(true);
    await userEvent.click(button('Yes'));
    await userEvent.click(button('Execute'));
    expect(sent()).toEqual([{ type: 'execute', playerId: 'bo', yes: ['psychopath'] }]);
  });

  it('asks nothing when nobody is executed', async () => {
    const asked = { roleId: role('psychopath'), question: 'Did they win roshambo?' };
    show(view('day', { day: { ...DAY, executionQuestions: [asked] } }), 'day');
    await userEvent.click(button('No one'));
    expect(screen.queryByText('Did they win roshambo?')).toBeNull();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'No one' }));
    expect(sent()).toEqual([{ type: 'execute', playerId: null, yes: [] }]);
  });

  it('once executed, says what to tell the table and leaves only the night', async () => {
    show(view('day', { day: { ...DAY, closed: true }, tell: ['Bo is executed and dies.'] }), 'day');
    expect(screen.getByText('Bo is executed and dies.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nominate' })).toBeNull();
    await userEvent.click(button('Start the night'));
    expect(sent()).toEqual([{ type: 'begin_night' }]);
  });
});

describe('the steward’s actions', () => {
  const spec = {
    key: 'k',
    title: 'Empath',
    prompt: 'Choose a player.',
    fields: [{ kind: 'player', label: 'Player', options: ['bo', 'cy'] }],
    distinct: false,
    allowDecline: false,
  };
  const specs = [spec] as unknown as PlayerView['me']['actions'];
  const lit = () => screen.getByRole('link', { name: 'Actions' }).className;

  it('take the night choice, and then have nothing to say', async () => {
    const { rerender } = show(view('night', { night: NIGHT, me: me({ actions: specs }, 'collecting') }), 'actions');
    expect(button('Submit').disabled).toBe(true);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'bo');
    await userEvent.click(button('Submit'));
    expect(sent()).toEqual([{ type: 'submit_night', actions: { k: { values: ['bo'] } } }]);
    rerender(<Console view={view('night', { night: NIGHT, me: me() })} tab="actions" />);
    expect(screen.getByText('Nothing to do now.')).toBeTruthy();
  });

  it('take a question in the night, with the tab marked until it is answered', async () => {
    const v = view('night', { night: NIGHT, me: me({ questions: specs }) });
    const { rerender } = show(v, 'table');
    expect(screen.queryByText('Choose a player.')).toBeNull();
    expect(lit()).not.toBe('');
    rerender(<Console view={v} tab="actions" />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'cy');
    await userEvent.click(button('Submit'));
    expect(sent()).toEqual([{ type: 'answer_question', key: 'k', choice: { values: ['cy'] } }]);
    rerender(<Console view={view('night', { night: NIGHT, me: me() })} tab="table" />);
    expect(lit()).toBe('');
  });

  it('take a question by day, which My role then has not', async () => {
    const prompt = { ...spec, prompt: 'Who said the word?', recorded: null };
    const v = view('day', { me: me({ dayPrompts: [prompt] as never }) });
    const { rerender } = show(v, 'actions');
    await userEvent.selectOptions(screen.getByRole('combobox'), 'cy');
    await userEvent.click(button('Save'));
    expect(sent()).toEqual([{ type: 'answer_day_prompt', key: 'k', values: ['cy'] }]);
    rerender(<Console view={v} tab="role" />);
    await userEvent.click(screen.getAllByRole('button')[0] as HTMLElement);
    expect(screen.queryByText('Who said the word?')).toBeNull();
  });
});

describe('the steward’s seat', () => {
  it('is shown in the header, the seating and the circle', () => {
    const { unmount } = show(view('setup'), 'setup');
    expect(screen.getByText(/You are in seat 1\./)).toBeTruthy();
    expect(screen.getByText(/1\. Ann.*\(you\)/)).toBeTruthy();
    unmount();
    show(view('day'), 'table');
    expect(button('Seat 1: Ann, alive, you')).toBeTruthy();
  });
});

describe('the autoplay toggle', () => {
  it('is on for the steward until the deal, and switches back', async () => {
    const { unmount } = show(view('setup'), 'setup');
    const box = screen.getByRole('checkbox', { name: 'Autoplay' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(sent()).toEqual([{ type: 'leave_autoplay' }]);
    unmount();
    show(view('day'), 'setup');
    expect(screen.queryByRole('checkbox', { name: 'Autoplay' })).toBeNull();
  });

  it('is off for the Storyteller until the game starts', async () => {
    render(<AutoplayToggle on={false} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Autoplay' }));
    expect(sent()).toEqual([{ type: 'choose_autoplay' }]);
  });
});

describe('the table', () => {
  it('shows who is dead and has a vote, and no character', () => {
    show(view('day'), 'table');
    expect(button('Seat 3: Cy, dead, no vote left')).toBeTruthy();
    expect(screen.queryByText('Empath')).toBeNull();
  });

  it('marks a player away', async () => {
    show(view('day'), 'table');
    await userEvent.click(button(/Seat 2: Bo/));
    await userEvent.click(button('Mark as away'));
    expect(sent()).toEqual([{ type: 'set_away', playerId: 'bo', away: true }]);
  });
});

describe('the steward’s own role', () => {
  const secrets = me({
    grants: [],
    messages: [
      { kind: 'night', n: 1, title: 'Empath', lines: ['You learn 2.'] },
    ] as unknown as PlayerView['me']['messages'],
  });

  it('is on no other tab', () => {
    for (const tab of ['lobby', 'night', 'day', 'table', 'actions', 'story']) {
      const { container, unmount } = show(view('day', { me: secrets }), tab);
      expect(container.textContent).not.toContain('You learn 2.');
      expect(container.textContent).not.toContain('Empath');
      unmount();
    }
  });

  it('is covered until pressed', async () => {
    show(view('day', { me: secrets }), 'role');
    expect(screen.queryByText('You learn 2.')).toBeNull();
    await userEvent.click(button('Show my information'));
    expect(screen.getByText('You learn 2.')).toBeTruthy();
  });
});

describe('the story', () => {
  it('is the public day until the game has ended', () => {
    const v = view('day', { publicStory: [{ n: 1, lines: ['Nobody died in the night.'] }] });
    const { rerender } = show(v, 'story');
    expect(screen.getByText('Nobody died in the night.')).toBeTruthy();
    const revealed: StewardView['revealed'] = {
      story: [],
      players: [{ id: id('bo'), name: 'Bo', character: role('imp'), believed: null, alignment: 'evil', alive: true }],
      bluffs: [role('empath')],
    };
    rerender(<Console view={view('ended', { revealed })} tab="story" />);
    expect(screen.getByText(/Imp, evil/)).toBeTruthy();
    expect(screen.getByText('Demon bluffs: Empath.')).toBeTruthy();
  });
});

describe('a phone in autoplay', () => {
  it('says once that its role has been seen', async () => {
    const { rerender } = render(<MyRole view={me()} />);
    await userEvent.click(button(/reveal|tap|show/i));
    expect(sent()).toEqual([{ type: 'seen_role' }]);
    run.mockClear();
    rerender(<MyRole view={me({ hasSeenRole: true })} />);
    await userEvent.click(screen.getAllByRole('button')[0] as HTMLElement);
    expect(sent()).toEqual([]);
  });

  it('says nothing of it in a Storyteller’s game', async () => {
    const { steward: _, ...plain } = me();
    render(<MyRole view={plain} />);
    await userEvent.click(screen.getAllByRole('button')[0] as HTMLElement);
    expect(sent()).toEqual([]);
  });

  it('asks its day question under the covered role, and sends the answer', async () => {
    const prompt = {
      key: 'word',
      title: 'Mezepheles',
      prompt: 'Who said the word?',
      fields: [{ kind: 'player', label: 'Player', options: ['bo', 'cy'] }],
      distinct: false,
      allowDecline: true,
      recorded: null,
    };
    render(<MyRole view={me({ hasSeenRole: true, dayPrompts: [prompt] as never })} />);
    expect(screen.queryByText('Who said the word?')).toBeNull();
    await userEvent.click(screen.getAllByRole('button')[0] as HTMLElement);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'cy');
    await userEvent.click(button('Save'));
    expect(sent()).toEqual([{ type: 'answer_day_prompt', key: 'word', values: ['cy'] }]);
  });

  it('offers the Storyteller’s job to the one asked, and tells everyone who took it', () => {
    const asked = { ...me({ offeredStoryteller: true }), tableNotes: ['Bo is the Storyteller now.'] };
    render(<TableNotes view={asked} />);
    expect(button(/Become the Storyteller/)).toBeTruthy();
    expect(screen.getByText('Bo is the Storyteller now.')).toBeTruthy();
    cleanup();
    expect(render(<TableNotes view={me()} />).container.textContent).toBe('');
  });
});
