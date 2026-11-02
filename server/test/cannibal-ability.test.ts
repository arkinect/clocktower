// The Cannibal's eaten ability as a source in abilitiesOf (shared/src/abilities.ts), and its hidden title. The
// Cannibal has no role data yet, so these tests set the assignment directly.
import { describe, expect, it } from 'vitest';
import { abilitiesOf, abilityKey, abilityTitle, type Assignment, type PlayerView } from '@ct/shared';
import { act, build, nextNight, resolve, resultFor, runNight, submit } from './helpers';
import { actingRoles, hasAbility } from '../src/engine/world';
import { actionSpecs } from '../src/engine/actions';
import { playerView } from '../src/engine/views';

const eat = (roleId: string | null, fromNight: number, fake = false): Assignment['eatenAbility'] =>
  ({ roleId, fromNight, executeeId: 'p99', fake });

describe('cannibal ability source', () => {
  it('a real Cannibal has the eaten ability from fromNight, after their own role', () => {
    const g = build(['empath', 'imp', 'butler', 'poisoner', 'sailor']);
    const a = g.s.assignments[g.p.empath];
    a.roleId = 'cannibal';
    a.eatenAbility = eat('fortune_teller', 2);
    expect(abilitiesOf(g.s, g.p.empath, 1)).toEqual([{ roleId: 'cannibal', source: 'role', real: true, fromNight: 0 }]);
    expect(hasAbility(g.s, g.p.empath, 'fortune_teller', 1)).toBe(false);
    expect(abilitiesOf(g.s, g.p.empath, 2)).toEqual([
      { roleId: 'cannibal', source: 'role', real: true, fromNight: 0 },
      { roleId: 'fortune_teller', source: 'cannibal', real: true, fromNight: 2 },
    ]);
    expect(hasAbility(g.s, g.p.empath, 'fortune_teller', 2)).toBe(true);
  });

  it('a fake eat (an evil executee) is not real; eating no ability, or no record, gives nothing', () => {
    const g = build(['empath', 'imp', 'butler', 'poisoner', 'sailor']);
    const a = g.s.assignments[g.p.empath];
    a.roleId = 'cannibal';
    a.eatenAbility = eat('poisoner', 2, true);
    expect(abilitiesOf(g.s, g.p.empath, 2)[1]).toEqual({ roleId: 'poisoner', source: 'cannibal', real: false, fromNight: 2 });
    expect(actingRoles(g.s, g.p.empath, 2)).toEqual(['cannibal', 'poisoner']);
    expect(hasAbility(g.s, g.p.empath, 'poisoner', 2)).toBe(false);
    a.eatenAbility = eat(null, 2);
    expect(abilitiesOf(g.s, g.p.empath, 2)).toHaveLength(1);
    a.eatenAbility = null;
    expect(abilitiesOf(g.s, g.p.empath, 2)).toHaveLength(1);
    delete a.eatenAbility;
    expect(abilitiesOf(g.s, g.p.empath, 2)).toHaveLength(1);
  });

  it('a Philosopher who gained the Cannibal has the eaten ability, once both are active', () => {
    const g = build(['philosopher', 'imp', 'butler', 'poisoner', 'sailor']);
    const a = g.s.assignments[g.p.philosopher];
    a.grantedAbility = { roleId: 'cannibal', fromNight: 2 };
    a.eatenAbility = eat('empath', 3);
    expect(abilitiesOf(g.s, g.p.philosopher, 2).map((x) => x.roleId)).toEqual(['philosopher', 'cannibal']);
    expect(abilitiesOf(g.s, g.p.philosopher, 3)).toEqual([
      { roleId: 'philosopher', source: 'role', real: true, fromNight: 0 },
      { roleId: 'cannibal', source: 'philosopher', real: true, fromNight: 2 },
      { roleId: 'empath', source: 'cannibal', real: true, fromNight: 3 },
    ]);
    expect(hasAbility(g.s, g.p.philosopher, 'empath', 3)).toBe(true);
    // Nothing while the Philosopher doesn't have the Cannibal's ability yet.
    a.grantedAbility = { roleId: 'cannibal', fromNight: 4 };
    expect(abilitiesOf(g.s, g.p.philosopher, 3).map((x) => x.roleId)).toEqual(['philosopher']);
  });

  for (const role of ['drunk', 'marionette'] as const) {
    it(`a ${role} who believes they are the Cannibal wakes as the eaten role, without the ability`, () => {
      const g = build([role, 'imp', 'butler', 'poisoner', 'sailor']);
      const a = g.s.assignments[g.p[role]];
      a.believedRoleId = 'cannibal';
      a.eatenAbility = eat('empath', 2);
      expect(abilitiesOf(g.s, g.p[role], 1)).toEqual([{ roleId: 'cannibal', source: 'believed', real: false, fromNight: 0 }]);
      expect(abilitiesOf(g.s, g.p[role], 2)).toEqual([
        { roleId: 'cannibal', source: 'believed', real: false, fromNight: 0 },
        { roleId: 'empath', source: 'cannibal', real: false, fromNight: 2 },
      ]);
      expect(actingRoles(g.s, g.p[role], 2)).toEqual(['cannibal', 'empath']);
      expect(hasAbility(g.s, g.p[role], 'empath', 2)).toBe(false);
    });
  }

  it('a player who is not a Cannibal has no eaten ability, whatever the record says', () => {
    const g = build(['drunk', 'imp', 'butler', 'poisoner', 'sailor']);
    g.s.assignments[g.p.butler].eatenAbility = eat('empath', 1);
    expect(abilitiesOf(g.s, g.p.butler, 5).map((x) => x.source)).toEqual(['role']);
    g.s.assignments[g.p.drunk].believedRoleId = 'empath';
    g.s.assignments[g.p.drunk].eatenAbility = eat('fortune_teller', 1);
    expect(abilitiesOf(g.s, g.p.drunk, 5).map((x) => x.source)).toEqual(['believed']);
  });
});

describe('hidden eaten ability', () => {
  it('an eaten ability is titled and keyed "Cannibal", unless the Cannibal learns it (Butler, Zealot)', () => {
    expect(abilityTitle({ roleId: 'fortune_teller', source: 'cannibal' })).toBe('Cannibal');
    expect(abilityTitle({ roleId: 'fortune_teller', source: 'cannibal' }, 'Fortune Teller')).toBe('Cannibal');
    expect(abilityTitle({ roleId: 'butler', source: 'cannibal' })).toBe('Butler');
    expect(abilityTitle({ roleId: 'zealot', source: 'cannibal' }, 'Zealot')).toBe('Zealot');
    expect(abilityKey({ roleId: 'fortune_teller', source: 'cannibal' })).toBe('cannibal');
    expect(abilityKey({ roleId: 'butler', source: 'cannibal' })).toBe('butler');
    for (const source of ['role', 'believed', 'philosopher', 'lil_monsta'] as const) {
      expect(abilityTitle({ roleId: 'fortune_teller', source })).toBe('Fortune Teller');
      expect(abilityTitle({ roleId: 'fortune_teller', source }, 'Custom')).toBe('Custom');
      expect(abilityKey({ roleId: 'fortune_teller', source })).toBe('fortune_teller');
    }
  });

  it('a believed Cannibal\'s picker and result go by "cannibal", and the result is false information', () => {
    const g = build(['drunk', 'imp', 'butler', 'empath', 'sailor', 'fortune_teller', 'poisoner']);
    const a = () => g.s.assignments[g.p.drunk];
    runNight(g, {});
    a().believedRoleId = 'cannibal';
    a().eatenAbility = eat('fortune_teller', 1);
    nextNight(g);
    act(g, { type: 'start_collecting' });
    expect(actionSpecs(g.s, g.p.drunk).map((x) => [x.key, x.roleId, x.title])).toEqual([['cannibal', 'cannibal', 'Cannibal']]);
    expect(actionSpecs(g.s, g.p.fortune_teller).map((x) => [x.key, x.title])).toEqual([['fortune_teller', 'Fortune Teller']]);
    // The Butler is an ability the Cannibal learns: its picker keeps its name and id.
    a().eatenAbility = eat('butler', 1);
    expect(actionSpecs(g.s, g.p.drunk).map((x) => [x.key, x.roleId, x.title])).toEqual([['butler', 'butler', 'Butler']]);
    a().eatenAbility = eat('empath', 1);
    const res = resolve(g);
    expect(resultFor(res, g.p.drunk, 'empath')).toBeUndefined();
    const row = resultFor(res, g.p.drunk, 'cannibal')!;
    expect(row).toMatchObject({ key: `${g.p.drunk}:cannibal`, roleId: 'cannibal', title: 'Cannibal', impaired: true });
    expect(row.suggestedLines).not.toEqual(row.trueLines);
    expect(resultFor(res, g.p.empath, 'empath')!.title).toBe('Empath');
  });

  /** Everything a player's phone receives, minus the script (every enabled role id, the same for all players). */
  const sent = (v: PlayerView) => JSON.stringify({ ...v, enabledRoles: undefined });

  /** A Philosopher who gained the Cannibal and ate `roleId` (not in play), from night 1. Seats: Philosopher, Imp, Poisoner, Empath, Butler. */
  function philosopherCannibal(roleId: string) {
    const g = build(['philosopher', 'imp', 'poisoner', 'empath', 'butler']);
    runNight(g, {});
    const a = g.s.assignments[g.p.philosopher];
    a.grantedAbility = { roleId: 'cannibal', fromNight: 1 };
    a.eatenAbility = { roleId, fromNight: 1, executeeId: g.p.butler, fake: false };
    nextNight(g);
    return g;
  }

  it('a hidden eaten ability\'s role id appears nowhere in the PlayerView, and its submission reaches the eaten role', () => {
    const g = philosopherCannibal('fortune_teller');
    const pid = g.p.philosopher;
    const name = (id: string) => g.s.players.find((p) => p.id === id)!.name;
    const view = () => playerView(g.s, pid, 0);
    expect(view().me.actions.map((x) => [x.key, x.roleId, x.title])).toEqual([['cannibal', 'cannibal', 'Cannibal']]);
    act(g, { type: 'submit_night', actions: { cannibal: { values: [g.p.imp, g.p.empath] } } }, pid);
    expect(sent(view())).not.toMatch(/fortune_teller|Fortune Teller/);
    const res = resolve(g);
    // The submission under "cannibal" is the Fortune Teller's choice: one of the two is the Demon.
    expect(resultFor(res, pid, 'cannibal')!.trueLines).toEqual([`${name(g.p.imp)} and ${name(g.p.empath)}: Yes, one of them is a Demon.`]);
    expect(res.actors.find((x) => x.playerId === pid)).toMatchObject({ roleId: 'fortune_teller' }); // the Storyteller sees it
    expect(sent(view())).not.toMatch(/fortune_teller|Fortune Teller/);
    act(g, { type: 'publish_night', force: true });
    expect(view().me.messages.filter((m) => m.night === 1).map((m) => m.title)).toEqual(['Cannibal']);
    expect(sent(view())).not.toMatch(/fortune_teller|Fortune Teller/);
  });

  it('a follow-up question from a hidden eaten ability is keyed and titled as the Cannibal', () => {
    const g = philosopherCannibal('ravenkeeper');
    const pid = g.p.philosopher;
    submit(g, { [g.p.imp]: { imp: [pid] } });
    const res = resolve(g);
    expect(res.followUps.map((f) => [f.key, f.roleId, f.spec.key, f.spec.roleId, f.spec.title]))
      .toEqual([[`cannibal:${pid}`, 'cannibal', `cannibal:${pid}`, 'cannibal', 'Cannibal']]);
    expect(sent(playerView(g.s, pid, 0))).not.toMatch(/ravenkeeper|Ravenkeeper/);
    act(g, { type: 'answer_follow_up', key: `cannibal:${pid}`, choice: { values: [g.p.imp] } }, pid);
    expect(resultFor(g.s.night!.resolution!, pid, 'cannibal')!.title).toBe('Cannibal');
    act(g, { type: 'publish_night', force: true });
    expect(sent(playerView(g.s, pid, 0))).not.toMatch(/ravenkeeper|Ravenkeeper/);
  });
});
