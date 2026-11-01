// Where abilities come from (shared/src/abilities.ts): one test per source.
import { describe, expect, it } from 'vitest';
import { abilitiesOf } from '@ct/shared';
import { build } from './helpers';
import { actingRoles, hasAbility } from '../src/engine/world';
import { actionSpecs } from '../src/engine/actions';

describe('abilities', () => {
  it('role: a player has their own role\'s ability', () => {
    const g = build(['empath', 'imp', 'butler', 'poisoner', 'sailor']);
    expect(abilitiesOf(g.s, g.p.empath, 1)).toEqual([{ roleId: 'empath', source: 'role', real: true, fromNight: 0 }]);
    expect(hasAbility(g.s, g.p.empath, 'empath', 1)).toBe(true);
  });

  it('believed: a Drunk who believes they are the Empath wakes as the Empath without the Empath ability', () => {
    const g = build(['drunk', 'imp', 'butler', 'poisoner', 'sailor'], (g) => {
      g.s.assignments[g.p.drunk].believedRoleId = 'empath';
    });
    expect(abilitiesOf(g.s, g.p.drunk, 1)).toEqual([{ roleId: 'empath', source: 'believed', real: false, fromNight: 0 }]);
    expect(actingRoles(g.s, g.p.drunk, 1)).toEqual(['empath']);
    expect(hasAbility(g.s, g.p.drunk, 'empath', 1)).toBe(false);
    expect(actionSpecs(g.s, g.p.drunk).map((s) => s.roleId)).toEqual([]); // the Empath has no choice to make
  });

  it('the actual role always counts: a Drunk or Marionette has their own role, not the believed one', () => {
    const g = build(['drunk', 'marionette', 'imp', 'butler', 'sailor']);
    g.s.assignments[g.p.drunk].believedRoleId = 'empath';
    g.s.assignments[g.p.marionette].believedRoleId = 'clockmaker';
    expect(hasAbility(g.s, g.p.drunk, 'drunk', 1)).toBe(true);
    expect(hasAbility(g.s, g.p.drunk, 'empath', 1)).toBe(false);
    expect(hasAbility(g.s, g.p.marionette, 'marionette', 1)).toBe(true);
    expect(hasAbility(g.s, g.p.marionette, 'clockmaker', 1)).toBe(false);
  });

  it('philosopher: a gained ability starts at fromNight', () => {
    const g = build(['philosopher', 'imp', 'butler', 'poisoner', 'sailor']);
    g.s.assignments[g.p.philosopher].grantedAbility = { roleId: 'slayer', fromNight: 2 };
    expect(abilitiesOf(g.s, g.p.philosopher, 1).map((x) => x.roleId)).toEqual(['philosopher']);
    expect(hasAbility(g.s, g.p.philosopher, 'slayer', 1)).toBe(false);
    expect(abilitiesOf(g.s, g.p.philosopher, 2)).toEqual([
      { roleId: 'philosopher', source: 'role', real: true, fromNight: 0 },
      { roleId: 'slayer', source: 'philosopher', real: true, fromNight: 2 },
    ]);
    expect(hasAbility(g.s, g.p.philosopher, 'slayer', 2)).toBe(true);
    expect(abilitiesOf(g.s, g.p.philosopher, Infinity).some((x) => x.roleId === 'slayer')).toBe(true);
  });

  it('lil_monsta: the token holder acts as Lil\' Monsta from night 1', () => {
    const g = build(['lil_monsta', 'butler', 'empath', 'sailor', 'clockmaker']);
    const holder = g.p.butler;
    g.s.setup.lilMonstaTokenHolderId = holder;
    expect(abilitiesOf(g.s, holder, 0).some((x) => x.source === 'lil_monsta')).toBe(false);
    expect(abilitiesOf(g.s, holder, 1)).toContainEqual({ roleId: 'lil_monsta', source: 'lil_monsta', real: true, fromNight: 1 });
    expect(actingRoles(g.s, holder, 1)).toContain('lil_monsta');
  });
});
