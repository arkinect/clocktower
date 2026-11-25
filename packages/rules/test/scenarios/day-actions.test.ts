// What every killing day action on the Day tab has in common. Who each one kills is in its own role's tests.
import { describe, expect, it } from 'vitest';
import { scene, ST, type Scene } from '../scenario';
import { pid } from '../helpers/game';

/** `kills` is a player each action kills and `spares` one it does not. A null `spares` kills anybody. */
const USES = [
  { role: 'golem', action: 'nominated', kills: 'bo', spares: 'cy', once: true },
  { role: 'inquisitor', action: 'nominated', kills: 'bo', spares: 'cy', once: true },
  { role: 'slayer', action: 'shoot', kills: 'cy', spares: 'bo', once: true },
  { role: 'psychopath', action: 'kill', kills: 'bo', spares: null, once: false },
];
const CURSES = [
  { role: 'witch', action: 'apply_curse', kills: 'bo', spares: null },
  { role: 'witch_king', action: 'apply_curse', kills: 'bo', spares: null },
];

/** Day 2, with ann holding the role, having cursed bo in the night if it is a curse. */
const day = (role: string) => {
  const s = scene({ ann: role, bo: 't1', cy: 'imp', di: 'poisoner', ed: 't3', fi: 't4' }).start().nextNight();
  if (CURSES.some((x) => x.role === role)) s.submit({ ann: ['bo'] });
  return s;
};
const row = (s: Scene, role: string) => s.dayActions().find((d) => d.roleId === role);
const used = (s: Scene, role: string) => s.state.abilities.get(s.ability(role))?.used;

describe('a killing day action', () => {
  it('previewed, changes nothing', () => {
    for (const { role, action, kills } of [...USES, ...CURSES]) {
      const s = day(role).dawn();
      expect(s.act(role, action, [kills], { mode: 'preview' }).effective, role).toBe(true);
      expect(s.alive(kills), role).toBe(true);
      expect(row(s, role)?.recorded, role).toBeNull();
      expect(used(s, role), role).toBe(false);
    }
  });

  it('can be forced either way by the Storyteller', () => {
    for (const { role, action, kills, spares } of [...USES, ...CURSES]) {
      const s = day(role).dawn();
      s.act(role, action, [kills], { mode: 'force_fail' });
      expect(s.alive(kills), role).toBe(true);
      if (!spares) continue;
      const t = day(role).dawn();
      expect(t.act(role, action, [spares], { mode: 'preview' }).effective, role).toBe(false);
      t.act(role, action, [spares], { mode: 'force_success' });
      expect(t.alive(spares), role).toBe(false);
    }
  });

  it('is shown confirmed until the day ends, and a second Use takes it back', () => {
    for (const { role, action, kills, once } of USES) {
      const s = day(role).dawn();
      s.act(role, action, [kills]);
      expect(s.alive(kills), role).toBe(false);
      expect(row(s, role), role).toMatchObject({ preview: true, recorded: [pid(kills)] });
      // Confirmed, so nobody else can be chosen until it is taken back.
      const other = { type: 'day_action' as const, abilityId: s.ability(role), action, mode: 'accept' as const };
      expect(s.g.tryAs(ST, { ...other, values: [pid('ed')] }).ok, role).toBe(false);
      s.act(role, action, []);
      expect(s.alive(kills), role).toBe(true);
      expect(row(s, role)?.recorded, role).toBeNull();
      expect(used(s, role), role).toBe(false);

      s.act(role, action, ['ed']);
      s.dusk().dawn();
      if (once) expect(row(s, role), role).toBeUndefined();
      else expect(row(s, role)?.recorded, role).toBeNull();
    }
  });

  it('does nothing while poisoned, and is spent', () => {
    for (const { role, action, kills, once } of USES) {
      const s = day(role)
        .submit({ di: ['ann'] })
        .dawn();
      expect(s.act(role, action, [kills]).effective, role).toBe(false);
      expect(s.alive(kills), role).toBe(true);
      expect(used(s, role), role).toBe(once);
    }
  });

  it('is not offered once its holder is dead', () => {
    for (const { role } of USES) expect(row(day(role).dawn().kill('ann'), role), role).toBeUndefined();
  });

  it('meets every protection: the Tea Lady keeps her neighbour alive', () => {
    const s = scene({ ann: 'psychopath', bo: 't1', cy: 'tea_lady', di: 't2', ed: 'imp', fi: 't3' }).start().dawn();
    expect(s.act('psychopath', 'kill', ['di']).effective).toBe(false);
    expect(s.alive('di')).toBe(true);
  });
});

describe('a curse switch', () => {
  it('pressed again is taken back, reviving them and cursing them again', () => {
    for (const { role, action } of CURSES) {
      const s = day(role).dawn();
      expect(row(s, role), role).toMatchObject({ control: 'toggle', preview: true, recorded: null });
      s.act(role, action, ['bo']);
      expect(s.alive('bo'), role).toBe(false);
      expect(row(s, role)?.recorded, role).toEqual([pid('bo')]);
      expect(s.act(role, action, ['bo']).summary, role).toBe('Taken back: bo is cursed again and alive.');
      expect(s.alive('bo'), role).toBe(true);
      expect(row(s, role)?.recorded, role).toBeNull();
      s.act(role, action, ['bo']);
      expect(s.alive('bo'), role).toBe(false);
    }
  });

  it('is not shown for a cursed player who died another way, until they are revived', () => {
    for (const { role, action } of CURSES) {
      const s = day(role).dawn().kill('bo');
      expect(row(s, role), role).toBeUndefined();
      s.g.st({ type: 'mark_alive', playerId: pid('bo'), alive: true });
      expect(row(s, role)?.fields[0]?.options, role).toEqual([pid('bo')]);
      expect(s.act(role, action, ['bo']).effective, role).toBe(true);
    }
  });
});
