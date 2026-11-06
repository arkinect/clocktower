import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionField, ActionSpec, Choice } from '@ct/protocol';
import { Picker, choiceComplete, optionText, type Names } from '../src/ui/Picker';

afterEach(cleanup);

const names: Names = { players: { a: 'Ann', b: 'Bo', c: 'Cy' }, roles: { imp: 'Imp', monk: 'Monk' } };
const players: ActionField = { kind: 'player', label: 'First', options: ['a', 'b', 'c'] };
const roles: ActionField = { kind: 'role', label: 'A role', options: ['imp', 'monk'] };
const answers: ActionField = {
  kind: 'option',
  label: 'Answer',
  options: ['live', 'die'],
  labels: { live: 'Live', die: 'Die' },
};

const spec = (over: Partial<ActionSpec>): ActionSpec => ({
  key: 'k',
  roleId: null,
  title: 'T',
  prompt: 'Choose',
  fields: [players],
  distinct: false,
  allowDecline: false,
  ...over,
});

function Harness({ s, spy, dead }: { s: ActionSpec; spy: (v: Record<string, Choice>) => void; dead?: Set<string> }) {
  const [value, setValue] = useState<Record<string, Choice>>({});
  return (
    <Picker
      specs={[s]}
      names={names}
      value={value}
      dead={dead}
      onChange={(v) => {
        setValue(v);
        spy(v);
      }}
    />
  );
}

describe('the picker', () => {
  it('player fields show names and return ids', async () => {
    const spy = vi.fn();
    render(<Harness s={spec({})} spy={spy} dead={new Set(['b'])} />);
    expect(screen.getByRole('option', { name: 'Bo (dead)' })).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('First'), 'c');
    expect(spy).toHaveBeenLastCalledWith({ k: { values: ['c'] } });
  });

  it('role fields show role names', async () => {
    const spy = vi.fn();
    render(<Harness s={spec({ fields: [roles] })} spy={spy} />);
    await userEvent.selectOptions(screen.getByLabelText('A role'), 'Monk');
    expect(spy).toHaveBeenLastCalledWith({ k: { values: ['monk'] } });
  });

  it('option fields are buttons with labels, keyboard reachable', async () => {
    const spy = vi.fn();
    render(<Harness s={spec({ fields: [answers] })} spy={spy} />);
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(spy).toHaveBeenLastCalledWith({ k: { values: ['live'] } });
    expect(screen.getByRole('button', { name: 'Live' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Die' }));
    expect(spy).toHaveBeenLastCalledWith({ k: { values: ['die'] } });
  });

  it('distinct disables what another field has taken', async () => {
    const second = { ...players, label: 'Second' };
    render(<Harness s={spec({ fields: [players, second], distinct: true })} spy={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('First'), 'a');
    const row = screen.getByLabelText('Second').querySelector('option[value="a"]') as HTMLOptionElement;
    expect(row.disabled).toBe(true);
  });

  it('decline clears the picks and uses the label the server sent', async () => {
    const spy = vi.fn();
    render(<Harness s={spec({ allowDecline: true, declineLabel: 'Not tonight' })} spy={spy} />);
    await userEvent.selectOptions(screen.getByLabelText('First'), 'a');
    await userEvent.click(screen.getByLabelText('Not tonight'));
    expect(spy).toHaveBeenLastCalledWith({ k: { decline: true, values: [] } });
    await userEvent.click(screen.getByLabelText('Not tonight'));
    expect(spy).toHaveBeenLastCalledWith({ k: { values: [] } });
  });

  it('no decline box without allowDecline', () => {
    render(<Harness s={spec({})} spy={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('choiceComplete', () => {
  const two = spec({ fields: [players, roles], distinct: true });

  it('needs every field', () => {
    expect(choiceComplete(two, undefined)).toBe(false);
    expect(choiceComplete(two, { values: ['a', ''] })).toBe(false);
    expect(choiceComplete(two, { values: ['a'] })).toBe(false);
    expect(choiceComplete(two, { values: ['a', 'imp'] })).toBe(true);
  });

  it('checks distinct and decline', () => {
    const dup = spec({ fields: [players, players], distinct: true });
    expect(choiceComplete(dup, { values: ['a', 'a'] })).toBe(false);
    expect(choiceComplete({ ...dup, distinct: false }, { values: ['a', 'a'] })).toBe(true);
    expect(choiceComplete(dup, { values: [], decline: true })).toBe(false);
    expect(choiceComplete({ ...dup, allowDecline: true }, { values: [], decline: true })).toBe(true);
  });

  it('falls back to ids for unknown options', () => {
    expect(optionText(players, 'zz', names)).toBe('zz');
    expect(optionText(roles, 'zz', names)).toBe('zz');
    expect(optionText(answers, 'zz', names)).toBe('zz');
  });
});
