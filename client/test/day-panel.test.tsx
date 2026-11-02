// The Day panel's Ability tracker, reminders and eyes-closed banner, for the Fisherman, Zealot and Organ Grinder.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Assignment, GameState } from '@ct/shared';
import { dayReminders, EyesClosedBanner, trackerRows } from '../src/admin/Day';

const assignment = (roleId: string, extra: Partial<Assignment> = {}): Assignment =>
  ({ roleId, believedRoleId: null, alignment: 'good', retainsAbilityWhenDead: false, grantedAbility: null, history: [], ...extra });

const state = (assignments: Record<string, Assignment>) =>
  ({ assignments, effects: [], flags: {}, setup: { lilMonstaTokenHolderId: null } }) as unknown as GameState;

describe('Day panel', () => {
  it('a Philosopher who gained the Fisherman gets an Ability tracker row for it', () => {
    const s = state({ p1: assignment('philosopher', { grantedAbility: { roleId: 'fisherman', fromNight: 2 } }) });
    expect(trackerRows(s, ['p1'])).toEqual([
      { id: 'p1', r: 'philosopher', k: 'philosopher_used', manual: false },
      { id: 'p1', r: 'fisherman', k: 'fisherman_used', manual: true },
    ]);
  });

  it('the Fisherman has a manual row; a Drunk who believes they are the Fisherman has none', () => {
    const s = state({ p1: assignment('fisherman'), p2: assignment('drunk', { believedRoleId: 'fisherman' }) });
    expect(trackerRows(s, ['p1', 'p2'])).toEqual([{ id: 'p1', r: 'fisherman', k: 'fisherman_used', manual: true }]);
  });

  it('the Fisherman, Zealot and Organ Grinder appear in the reminders', () => {
    const s = state({ p1: assignment('fisherman'), p2: assignment('zealot'), p3: assignment('organ_grinder'), p4: assignment('baron') });
    const out = dayReminders(s, ['p1', 'p2', 'p3', 'p4'], (id) => `[${id}]`);
    expect(out).toEqual([
      '[p1]: Day ability: give advice in person. Mark used in the Ability tracker.',
      '[p2]: Must vote for every nomination while 5 or more players are alive (not enforced).',
      expect.stringMatching(/^\[p3\]: Eyes-closed voting/),
    ]);
  });

  it('shows "Eyes-closed voting today" only when the server says so (absent on older servers)', () => {
    expect(renderToStaticMarkup(<EyesClosedBanner on />)).toContain('Eyes-closed voting today.');
    expect(renderToStaticMarkup(<EyesClosedBanner on={false} />)).toBe('');
    expect(renderToStaticMarkup(<EyesClosedBanner on={undefined} />)).toBe('');
  });
});
