// The Story tab: a table per night and labelled lines per day. Views are built by hand: the web never imports the rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StorytellerView } from '@ct/protocol';

vi.mock('../src/app/store', () => ({
  useGame: () => ({ catalog: [{ roleId: 'empath', name: 'Empath', type: 'townsfolk' }], jinxes: [] }),
  useCommand: () => ({ run: vi.fn(async () => ({ ok: true })), pending: false }),
  useNames: () => ({ players: { a: 'Ann', b: 'Bo' }, roles: { empath: 'Empath', imp: 'Imp' } }),
}));

import { Story } from '../src/storyteller/Story';

afterEach(cleanup);

const row = (over: Record<string, unknown>) => ({
  playerId: 'a',
  seat: 0,
  name: 'Ann',
  character: 'empath',
  believed: null,
  alignment: 'good',
  aliveAtStart: true,
  aliveAtEnd: true,
  causes: [],
  actions: [],
  received: [],
  ...over,
});

const view = {
  story: [
    {
      kind: 'night',
      n: 1,
      deaths: ['b'],
      revived: [],
      rows: [
        row({
          causes: ['poisoned:Poisoner'],
          received: [{ title: 'Empath', lines: ['2'], truth: ['0'] }],
        }),
        row({
          playerId: 'b',
          seat: 1,
          name: 'Bo',
          character: 'imp',
          alignment: 'evil',
          aliveAtEnd: false,
          actions: [{ roleId: null, slot: 'Imp', input: 'Bo', outcome: 'Bo dies' }],
        }),
      ],
    },
    { kind: 'day', n: 2, execution: null, deaths: [], other: [], notes: 'Quiet' },
  ],
} as unknown as StorytellerView;

describe('the Story tab', () => {
  it('draws each night as a table with the six 0.4.2 columns', () => {
    render(<Story view={view} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['#', 'Player', 'Role', 'Drunk / poisoned', 'Targets and outcome', 'Information received']);
  });

  it('shows the truth under false information, and "sober" for an unimpaired row', () => {
    render(<Story view={view} />);
    expect(screen.getByText('Truth: 0')).toBeTruthy();
    expect(screen.getByText('Poisoned by the Poisoner')).toBeTruthy();
    expect(screen.getByText('sober')).toBeTruthy();
    expect(screen.getByText('(died)', { exact: false })).toBeTruthy();
    expect(screen.getByText('Imp:')).toBeTruthy();
  });

  it('a day is a few labelled lines', () => {
    render(<Story view={view} />);
    expect(screen.getByText('Execution: none')).toBeTruthy();
    expect(screen.getByText('Died during the day: nobody')).toBeTruthy();
    expect(screen.getByText('Notes: Quiet')).toBeTruthy();
  });

  it('folds a night away from its heading', async () => {
    render(<Story view={view} />);
    await userEvent.click(screen.getByRole('button', { name: /Night 1/ }));
    expect(screen.queryByRole('table')).toBeNull();
  });
});
