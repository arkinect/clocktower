// The Setup tab.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupFieldSpec, type StorytellerView } from '@ct/protocol';
import { card, player } from '../views';

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

import { AssignRow, Field, RoleChecks, Settings, TypeCounts, countsHint } from '../../src/storyteller/Setup';

afterEach(() => {
  cleanup();
  run.mockClear();
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

  it('show what the rules sent, with a Suggest button only where a suggestion exists', () => {
    const { rerender } = render(<Field spec={field} />);
    const select = screen.getByRole('combobox', { name: 'Outsider change' }) as HTMLSelectElement;
    expect(select.value).toBe('+1');
    expect([...select.options].filter((o) => o.value).map((o) => o.text)).toEqual(['+1 Outsider']);
    expect(screen.queryByRole('button', { name: 'Suggest' })).toBeNull();
    rerender(<Field spec={{ ...field, suggestible: true }} />);
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeTruthy();
  });
});

describe('setup assignment', () => {
  const setupView = {
    setup: { believedOptions: {}, fields: [] },
    script: ['empath', 'beggar'],
  } as unknown as StorytellerView;

  it("asks for a Traveller's alignment, and leaves every other character on its own", () => {
    const { rerender } = render(<AssignRow view={setupView} player={player({ character: 'beggar' })} />);
    expect(screen.getByLabelText('Alignment of Ann')).toBeTruthy();
    rerender(<AssignRow view={setupView} player={player({ character: 'empath' })} />);
    expect(screen.queryByLabelText('Alignment of Ann')).toBeNull();
    expect(screen.getByLabelText('Character for Ann')).toBeTruthy();
  });

  it('shows what a role does while it is hovered in the script list', async () => {
    render(<RoleChecks roles={[card]} on={[]} onToggle={() => {}} />);
    const check = screen.getByRole('checkbox', { name: 'Empath' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    await userEvent.hover(check);
    expect(screen.getByRole('tooltip').textContent).toBe(card.abilityText);
    await userEvent.unhover(check);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it("puts a field tied to the player (Lil' Monsta's Minion) in their row", async () => {
    const field = SetupFieldSpec.parse({
      abilityId: 'a5',
      field: 'minion',
      title: "The Minion the Lil' Monsta player becomes",
      kind: 'role',
      options: [{ id: 'empath', label: 'Empath' }],
      value: null,
      suggestible: false,
      row: { playerId: 'aaaaaaaaaaaaaaaa', label: 'plays as' },
    });
    const v = { ...setupView, setup: { ...setupView.setup, fields: [field] } } as StorytellerView;
    render(<AssignRow view={v} player={player({ character: 'empath' })} />);
    await userEvent.selectOptions(screen.getByLabelText('Ann plays as'), 'empath');
    expect(run).toHaveBeenCalledWith({ type: 'set_setup_field', abilityId: 'a5', field: 'minion', value: 'empath' });
    cleanup();
    render(<AssignRow view={v} player={player({ id: 'bbbbbbbbbbbbbbbb', name: 'Bo', character: 'empath' })} />);
    expect(screen.queryByLabelText('Bo plays as')).toBeNull();
  });
});

describe('setup: character type counts', () => {
  const seven = [...'ABCDEFG'].map((name, seat) => player({ id: 'abcdef1'.charAt(seat).repeat(16), name, seat }));
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
    const eight = {
      ...countsView([5, 1, 1, 1]),
      players: [...seven, player({ id: '0'.repeat(16), name: 'H', seat: 7 })],
    };
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

  it('offers Teensyville as a third evil information rule', async () => {
    render(<Settings view={settingsView} />);
    const group = screen.getByRole('group', { name: 'Evil information' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['House', 'Official', 'Teensyville']);
    await userEvent.click(within(group).getByRole('button', { name: 'Teensyville' }));
    expect(run).toHaveBeenCalledWith({ type: 'set_settings', evilInfoPolicy: 'teensyville' });
  });
});
