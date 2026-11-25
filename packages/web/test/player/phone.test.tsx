// What a player’s phone shows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Jinx, RoleCard, type PlayerView } from '@ct/protocol';
import { card } from '../views';

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

// The idle games are not under test: the night screen only needs something to put in their place.
vi.mock('../../src/games/NightGames', () => ({ default: () => null }));

import { Ended, Night } from '../../src/player/PlayerApp';
import { RoleCardView, RoleList, typeName } from '../../src/player/parts';

afterEach(() => {
  cleanup();
  run.mockClear();
});

describe('the role card', () => {
  it('keeps everything secret out of the page until it is revealed', async () => {
    render(<RoleCardView role={card} secret={<p>Your fellow Minions: Bo</p>} />);
    expect(screen.queryByText('Your fellow Minions: Bo')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tap to reveal your role' }));
    expect(screen.getByText('Your fellow Minions: Bo')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Tap to hide/ }));
    expect(screen.queryByText('Your fellow Minions: Bo')).toBeNull();
  });

  it('keeps both faces and shows one', async () => {
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

describe('the role list', () => {
  it('names one of each type', () => {
    const types = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'] as const;
    expect(types.map((x) => typeName(x))).toEqual(['Townsfolk', 'Outsider', 'Minion', 'Demon', 'Traveller']);
  });

  const list: RoleCard[] = [card, RoleCard.parse({ ...card, roleId: 'imp', name: 'Imp', type: 'demon' })];
  const jinxes = [Jinx.parse({ a: 'empath', b: 'imp', text: 'They do not get along.' })];

  it('shows a jinx only when both roles are on the script', () => {
    const { rerender } = render(<RoleList script={['empath', 'imp']} catalog={list} jinxes={jinxes} />);
    expect(screen.getByRole('heading', { name: 'Jinxes' })).toBeTruthy();
    expect(screen.getByText(/They do not get along/)).toBeTruthy();
    rerender(<RoleList script={['empath']} catalog={list} jinxes={jinxes} />);
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

  it('says who won, or that an update ended it', () => {
    const { rerender } = render(<Ended view={view('storyteller', 'evil')} />);
    expect(screen.queryByText(/app update/)).toBeNull();
    expect(screen.getByText('Evil wins.')).toBeTruthy();
    rerender(<Ended view={view('update')} />);
    expect(screen.getByText('The game ended for an app update.')).toBeTruthy();
  });
});

describe('the night on a phone', () => {
  const spec = {
    key: 'k',
    roleId: null,
    title: 'Poisoner',
    prompt: 'Choose a player.',
    fields: [{ kind: 'player', label: 'Player', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
    distinct: false,
    allowDecline: false,
  };
  const nightView = (n: number, submission: Record<string, { values: string[] }> | null) =>
    ({
      deadAtDawn: [],
      serverNow: 0,
      phase: { kind: 'night', n, stage: 'collecting', deadline: null, winner: null, endedReason: null },
      me: { id: 'aaaaaaaaaaaaaaaa', actions: [spec], questions: [], submitted: submission !== null, submission },
    }) as unknown as PlayerView;
  const chosen = () => (screen.getByLabelText('Player') as HTMLSelectElement).value;

  it('Change opens on what was submitted, on a phone that has just reloaded too', async () => {
    render(<Night view={nightView(1, { k: { values: ['bbbbbbbbbbbbbbbb'] } })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(chosen()).toBe('bbbbbbbbbbbbbbbb');
  });

  it('a player with nothing to change has no bar under the games', () => {
    const view = nightView(1, {});
    const { container } = render(<Night view={{ ...view, me: { ...view.me, actions: [] } }} />);
    expect(container.querySelector('footer')).toBeNull();
  });

  it('a new night starts with nothing chosen', async () => {
    const { rerender } = render(<Night view={nightView(1, { k: { values: ['bbbbbbbbbbbbbbbb'] } })} />);
    rerender(<Night view={nightView(2, null)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Night action' }));
    expect(chosen()).toBe('');
  });
});
