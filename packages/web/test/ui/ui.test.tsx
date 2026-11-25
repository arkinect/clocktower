// Small controls used on every screen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HoldButton, UpdateBar } from '../../src/ui/ui';

afterEach(cleanup);

describe('the hold button', () => {
  it('keeps both labels in place and shows one', async () => {
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
