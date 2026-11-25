// What the Storyteller�s panels share: wording and the sheet for typed values.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { condition, console_, player } from '../views';

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

import { InputSheet, causeLabel, causesWithoutRow, phaseText } from '../../src/storyteller/common';

afterEach(() => {
  cleanup();
  run.mockClear();
});

describe('wording', () => {
  it('names each phase', () => {
    for (const [phase, text] of [
      [{ kind: 'night', n: 2, stage: 'review' }, 'Night 2: review'],
      [{ kind: 'day', n: 3 }, 'Day 3'],
      [{ kind: 'lobby', n: 0 }, 'Lobby'],
      [{ kind: 'setup', n: 0 }, 'Setup'],
      [{ kind: 'ended', n: 4 }, 'Game over'],
    ] as const) {
      expect(phaseText(console_(phase))).toBe(text);
    }
  });

  it('says what made a player drunk or poisoned', () => {
    for (const [cause, text] of [
      ['poisoned:Poisoner', 'Poisoned by the Poisoner'],
      ['drunk:Sailor', 'Drunk by the Sailor'],
      ['drunk:storyteller', 'Drunk (set by you)'],
      ['poisoned:storyteller', 'Poisoned (set by you)'],
      ['drunk:Drunk', 'drunk (own role)'],
      ['drunk:Marionette', 'drunk (own role)'],
    ] as const) {
      expect(causeLabel(cause)).toBe(text);
    }
  });

  it('leaves out a cause the conditions list already shows', () => {
    const p = player({
      impaired: true,
      causes: ['poisoned:Poisoner', 'drunk:storyteller', 'poisoned:No Dashii'],
      conditions: [condition({}), condition({ id: 'c2', type: 'drunk', sourceLabel: 'Storyteller' })],
    });
    expect(causesWithoutRow(p)).toEqual(['poisoned:No Dashii']);
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
