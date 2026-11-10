// The console shell: its theme and its tab strip. Views are built by hand: the web never imports the rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
    phase: { kind, n: 1, stage: kind === 'night' ? 'choices' : null, deadline: null, winner: null, endedReason: null },
  }) as unknown as StorytellerView;

describe('console theme', () => {
  it('is dark while open, and lets the page follow the device again once closed', () => {
    const { unmount } = render(<Console view={view('setup')} tab="reference" />);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    unmount();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});
