// changeRole (server/src/engine/world.ts): the one way to change a player's role, for every combination of options.
import { describe, expect, it } from 'vitest';
import type { GameState } from '@ct/shared';
import { build } from './helpers';
import { changeRole, type ChangeRoleOpts } from '../src/engine/world';

/** A Philosopher with everything a role change can touch: history, gained ability, memory, an effect, a flag. */
function loaded(): { s: GameState; pid: string; other: string } {
  const g = build(['philosopher', 'imp', 'empath', 'butler', 'poisoner']);
  const pid = g.p.philosopher;
  const a = g.s.assignments[pid];
  a.grantedAbility = { roleId: 'sailor', fromNight: 2 };
  a.retainsAbilityWhenDead = true;
  g.s.roleState[pid] = { lastTarget: g.p.empath };
  g.s.flags[pid] = { philosopher_used: true };
  g.s.effects.push({ id: 'e-mine', type: 'drunk', cause: 'philosopher', sourcePlayerId: pid, targetPlayerId: g.p.empath, startNight: 1, expiry: 'until_removed' });
  g.s.effects.push({ id: 'e-other', type: 'poisoned', cause: 'poisoner', sourcePlayerId: g.p.poisoner, targetPlayerId: g.p.empath, startNight: 1, expiry: 'until_dusk' });
  return { s: g.s, pid, other: g.p.poisoner };
}

const COMBOS: ChangeRoleOpts[] = [];
for (const keepAbilities of [false, true]) for (const keepTies of [false, true]) for (const clearFlags of [false, true]) {
  COMBOS.push({ keepAbilities, keepTies, clearFlags });
}

describe('changeRole', () => {
  for (const opts of COMBOS) {
    it(`keepAbilities=${opts.keepAbilities} keepTies=${opts.keepTies} clearFlags=${opts.clearFlags}`, () => {
      const { s, pid } = loaded();
      const historyBefore = s.assignments[pid].history.length;
      changeRole(s, pid, 'imp', 'test', 123, opts);
      const a = s.assignments[pid];
      // Always: new role, its alignment, no believed role, one history entry.
      expect(a).toMatchObject({ roleId: 'imp', alignment: 'evil', believedRoleId: null });
      expect(a.history).toHaveLength(historyBefore + 1);
      expect(a.history.at(-1)).toEqual({ at: 123, from: 'philosopher', to: 'imp', reason: 'test' });
      // keepAbilities
      expect(a.grantedAbility).toEqual(opts.keepAbilities ? { roleId: 'sailor', fromNight: 2 } : null);
      expect(a.retainsAbilityWhenDead).toBe(!!opts.keepAbilities);
      // keepTies
      expect(s.roleState[pid]).toEqual(opts.keepTies ? { lastTarget: expect.any(String) } : undefined);
      expect(s.effects.map((e) => e.id)).toEqual(opts.keepTies ? ['e-mine', 'e-other'] : ['e-other']);
      // clearFlags
      expect(s.flags[pid]).toEqual(opts.clearFlags ? undefined : { philosopher_used: true });
    });
  }

  it('to no role: good alignment, history records it', () => {
    const { s, pid } = loaded();
    changeRole(s, pid, null, 'setup', 5, { keepTies: true });
    expect(s.assignments[pid]).toMatchObject({ roleId: null, alignment: 'good' });
    expect(s.assignments[pid].history.at(-1)).toMatchObject({ from: 'philosopher', to: null });
  });

  it('an eaten ability is cleared unless keepAbilities, and "none" is left absent', () => {
    for (const keepAbilities of [false, true]) {
      const { s, pid } = loaded();
      const eaten = { roleId: 'empath', fromNight: 3, executeeId: 'p9', fake: false };
      s.assignments[pid].eatenAbility = eaten;
      changeRole(s, pid, 'imp', 'test', 1, { keepAbilities });
      if (keepAbilities) expect(s.assignments[pid].eatenAbility).toEqual(eaten);
      else expect('eatenAbility' in s.assignments[pid]).toBe(false);
    }
    const { s, pid } = loaded();
    changeRole(s, pid, 'imp', 'test', 1, { keepAbilities: true });
    expect('eatenAbility' in s.assignments[pid]).toBe(false);
  });

  it('keepAlignment keeps the player\'s alignment instead of the new role\'s', () => {
    const { s, pid } = loaded();
    s.assignments[pid].alignment = 'evil';
    changeRole(s, pid, 'empath', 'test', 1, { keepAlignment: true });
    expect(s.assignments[pid]).toMatchObject({ roleId: 'empath', alignment: 'evil' });
    changeRole(s, pid, 'imp', 'test', 2);
    s.assignments[pid].alignment = 'good'; // e.g. a Goon's change
    changeRole(s, pid, 'poisoner', 'test', 3, { keepAlignment: true, keepAbilities: true, keepTies: true });
    expect(s.assignments[pid]).toMatchObject({ roleId: 'poisoner', alignment: 'good' });
    changeRole(s, pid, 'butler', 'test', 4);
    expect(s.assignments[pid].alignment).toBe('good');
    changeRole(s, pid, 'imp', 'test', 5, { keepAlignment: false });
    expect(s.assignments[pid].alignment).toBe('evil');
  });

  it('keepAlignment for a player with no assignment yet uses the new role\'s alignment', () => {
    const { s, pid } = loaded();
    delete s.assignments[pid];
    changeRole(s, pid, 'imp', 'setup', 7, { keepAlignment: true });
    expect(s.assignments[pid].alignment).toBe('evil');
  });

  it('a player with no assignment yet gets one', () => {
    const { s, pid } = loaded();
    delete s.assignments[pid];
    changeRole(s, pid, 'empath', 'setup', 7);
    expect(s.assignments[pid]).toEqual({
      roleId: 'empath', believedRoleId: null, alignment: 'good', retainsAbilityWhenDead: false, grantedAbility: null,
      history: [{ at: 7, from: null, to: 'empath', reason: 'setup' }],
    });
  });
});
