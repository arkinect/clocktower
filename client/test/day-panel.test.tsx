// The Day panel's Ability tracker, reminders and eyes-closed banner, for the Fisherman, Zealot and Organ Grinder.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Assignment, GameState } from '@ct/shared';
import { CannibalEat, cannibalRows, cannibalSummary, dayReminders, EyesClosedBanner, trackerRows } from '../src/admin/Day';
import type { AdminCtx } from '../src/admin/AdminApp';

const assignment = (roleId: string, extra: Partial<Assignment> = {}): Assignment =>
  ({ roleId, believedRoleId: null, alignment: 'good', retainsAbilityWhenDead: false, grantedAbility: null, history: [], ...extra });

const state = (assignments: Record<string, Assignment>, effects: unknown[] = []) =>
  ({ assignments, effects, flags: {}, setup: { lilMonstaTokenHolderId: null }, script: ['empath', 'cannibal', 'butler'] }) as unknown as GameState;

const ate = (roleId: string | null, fake = false) => ({ eatenAbility: { roleId, fromNight: 2, executeeId: 'p9', fake } });
const poison = (pid: string) => ({ id: 'e1', type: 'poisoned', cause: 'cannibal', sourcePlayerId: pid, targetPlayerId: pid, startNight: 1, expiry: 'until_removed' });

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

  it('a Cannibal row for each player with the Cannibal\'s ability (real or believed) who has eaten', () => {
    const s = state({
      p1: assignment('cannibal', ate('empath')),
      p2: assignment('cannibal', ate(null, true)),
      p3: assignment('drunk', { believedRoleId: 'cannibal', ...ate('empath') }),
      p4: assignment('philosopher', { grantedAbility: { roleId: 'cannibal', fromNight: 1 }, ...ate('butler') }),
      p5: assignment('cannibal'),
      p6: assignment('empath', ate('butler')),
    }, [poison('p2')]);
    const rows = cannibalRows(s, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(rows.map(cannibalSummary)).toEqual([
      'the Empath ability from night 2',
      'evil, poisoned; thinks they have no ability',
      'the Empath ability from night 2 (not real: they only think they are the Cannibal)',
      'the Butler ability from night 2',
    ]);
  });

  it('the Cannibal row\'s dropdown starts at the eaten ability (Nothing after an evil eat), with Confirm off until it changes', () => {
    const s = state({ p1: assignment('cannibal', ate(null, true)), p2: assignment('cannibal', ate('empath')) }, [poison('p1')]);
    const ctx = { s, names: { p1: 'Ada', p2: 'Bo', p9: 'Cy' }, label: (id: string) => id, isDead: () => false } as unknown as AdminCtx;
    const [evil, good] = cannibalRows(s, ['p1', 'p2']);
    const html = renderToStaticMarkup(<CannibalEat ctx={ctx} row={evil} />);
    expect(html).toContain('ate <span>p9</span>: evil, poisoned; thinks they have no ability');
    expect(html).toContain('<option value="" selected="">Nothing</option>');
    expect(html).not.toContain('value="cannibal"');
    expect(html).toContain('<button disabled="">Confirm</button>');
    expect(renderToStaticMarkup(<CannibalEat ctx={ctx} row={good} />)).toContain('<option value="empath" selected="">Empath</option>');
  });

  it('shows "Eyes-closed voting today" only when the server says so (absent on older servers)', () => {
    expect(renderToStaticMarkup(<EyesClosedBanner on />)).toContain('Eyes-closed voting today.');
    expect(renderToStaticMarkup(<EyesClosedBanner on={false} />)).toBe('');
    expect(renderToStaticMarkup(<EyesClosedBanner on={undefined} />)).toBe('');
  });
});
