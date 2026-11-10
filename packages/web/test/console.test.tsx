// The console shell: its tab strip. Views are built by hand: the web never imports the rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StorytellerView } from '@ct/protocol';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../src/app/router', () => ({ navigate }));
vi.mock('../src/app/store', () => ({
  useGame: () => ({ catalog: [], jinxes: [] }),
  useCommand: () => ({ run: vi.fn(async () => ({ ok: true })), pending: false }),
  useNames: () => ({ players: {}, roles: {} }),
}));

import Console from '../src/storyteller/Console';

afterEach(() => {
  cleanup();
  navigate.mockClear();
});

// Only what the shell reads; the panel itself is not under test, so `reference` is the tab shown.
const view = (kind: StorytellerView['phase']['kind']) =>
  ({
    code: 'ABCD',
    players: [],
    script: [],
    story: [],
    phase: { kind, n: 1, stage: kind === 'night' ? 'choices' : null, deadline: null, winner: null, endedReason: null },
  }) as unknown as StorytellerView;

describe('tab strip', () => {
  const strip = () =>
    within(screen.getByRole('navigation', { name: 'Console sections' }))
      .getAllByRole('link')
      .map((a) => a.textContent);

  it('shows every tab before the game starts, with no More button', () => {
    render(<Console view={view('setup')} tab="reference" />);
    expect(strip()).toEqual(['Lobby', 'Setup', 'Night', 'Review', 'Day', 'Grimoire', 'Story', 'Log', 'Reference']);
    expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
  });

  it('tucks Lobby, Setup, Story and Log under More once the game has started', async () => {
    render(<Console view={view('day')} tab="reference" />);
    expect(strip()).toEqual(['Night', 'Review', 'Day', 'Grimoire', 'Reference']);
    const more = screen.getByRole('button', { name: /More/ });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((a) => a.textContent)).toEqual(['Lobby', 'Setup', 'Story', 'Log']);
  });

  it('opens a tucked tab from More, which then reads as its name', async () => {
    const { rerender } = render(<Console view={view('day')} tab="reference" />);
    await userEvent.click(screen.getByRole('button', { name: /More/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Story' }));
    expect(navigate).toHaveBeenCalledWith('/g/ABCD/storyteller/story');
    expect(screen.queryByRole('menu')).toBeNull();
    rerender(<Console view={view('day')} tab="story" />);
    expect(screen.getByRole('button', { name: 'Story ▾' })).toBeTruthy();
  });

  it('closes on Escape and gives focus back to More', async () => {
    render(<Console view={view('night')} tab="reference" />);
    const more = screen.getByRole('button', { name: /More/ });
    await userEvent.click(more);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more);
  });
});
