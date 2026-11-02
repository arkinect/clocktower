// The night orders (shared/src/roles.ts FIRST_NIGHT_ORDER / OTHER_NIGHT_ORDER) and the constraints in design.md 14.1.
// Role groups are written out here, so a new role must be placed in a group on purpose.
import { describe, expect, it } from 'vitest';
import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, ROLE_BY_ID, ROLES, type NightSlot } from '@ct/shared';
import { BEHAVIOURS } from '../src/engine/roles';

const ORDERS: [string, NightSlot[]][] = [['first night', FIRST_NIGHT_ORDER], ['other nights', OTHER_NIGHT_ORDER]];

const MODIFIERS = ['philosopher', 'sailor', 'poisoner', 'innkeeper'];
const DEMONS = ['imp', 'pukka', 'shabaloth', 'po', 'no_dashii', 'vigormortis', 'lil_monsta'];
const KILLS = [...DEMONS, 'gambler', 'assassin', 'godfather', 'gossip', 'moonchild'];
const INFORMATION = [
  'clockmaker', 'empath', 'fortune_teller', 'flowergirl', 'oracle', 'seamstress', 'juggler', 'balloonist', 'grandmother', 'mathematician',
];
/** Kills allowed after the Professor. The Professor's picker lists only players dead at the start of the night, so a
 * kill's place relative to the Professor only decides whether a Professor it kills has already acted. */
const AFTER_PROFESSOR = ['moonchild'];
/**
 * Exception: slots that exist on other nights only for an ability just gained. A start-information role
 * (RoleData.startInfo) gives its night-0 information to a player who gains it later, on the first night it is
 * active (startInfoPending), so it needs an other-night slot even when it has no other-night ability. The Clockmaker
 * is such a role: its other-night slot never wakes anyone otherwise. It sits beside the Grandmother's, after every
 * kill, so the information is about the night's final state, like hers.
 */
const JUST_GAINED_ONLY = ['clockmaker'];

/** Position of each role slot, ignoring pseudo-slots such as Demon Info. */
function positions(order: NightSlot[]): Map<string, number> {
  return new Map(order.flatMap((s, i) => (s.roleId ? [[s.roleId, i] as const] : [])));
}

/** Every role of `before` in the order comes before every role of `after` in it. */
function expectBefore(order: NightSlot[], before: string[], after: string[]) {
  const pos = positions(order);
  for (const b of before) for (const a of after) {
    if (b === a || !pos.has(b) || !pos.has(a)) continue;
    expect(pos.get(b)!, `${b} before ${a}`).toBeLessThan(pos.get(a)!);
  }
}

describe('night order', () => {
  it('the role groups name real roles, and every Demon is in DEMONS', () => {
    for (const id of [...MODIFIERS, ...KILLS, ...INFORMATION, 'professor', 'ravenkeeper']) expect(ROLE_BY_ID[id], id).toBeDefined();
    expect(ROLES.filter((r) => r.type === 'demon').map((r) => r.id).sort()).toEqual([...DEMONS].sort());
  });

  for (const [name, order] of ORDERS) {
    describe(name, () => {
      const roleIds = order.flatMap((s) => (s.roleId ? [s.roleId] : []));
      const others = roleIds.filter((r) => !MODIFIERS.includes(r));

      it('Philosopher, Sailor, Poisoner and Innkeeper first, in that order', () => {
        expect(roleIds.slice(0, roleIds.length - others.length)).toEqual(MODIFIERS.filter((r) => roleIds.includes(r)));
      });

      it('kills before the Ravenkeeper and information roles', () => {
        expectBefore(order, KILLS, ['ravenkeeper', ...INFORMATION]);
      });

      it('kills before the Professor, except the Moonchild', () => {
        expectBefore(order, KILLS.filter((k) => !AFTER_PROFESSOR.includes(k)), ['professor']);
      });

      it('Professor before the Empath and Oracle', () => {
        expectBefore(order, ['professor'], ['empath', 'oracle']);
      });

      it('Grandmother after every Demon', () => {
        expectBefore(order, DEMONS, ['grandmother']);
      });

      it('Mathematician last', () => {
        expect(order.at(-1)!.roleId).toBe('mathematician');
      });

      it('every slot\'s role exists, once', () => {
        for (const r of roleIds) expect(ROLE_BY_ID[r], r).toBeDefined();
        expect(new Set(roleIds).size).toBe(roleIds.length);
        expect(new Set(order.map((s) => s.id)).size).toBe(order.length);
      });
    });
  }

  it('every start-information role has a slot on both orders; the just-gained-only slots say so and sit by the Grandmother', () => {
    const startInfo = ROLES.filter((r) => r.startInfo).map((r) => r.id);
    for (const [, order] of ORDERS) for (const r of startInfo) expect(positions(order).has(r), r).toBe(true);
    for (const r of JUST_GAINED_ONLY) {
      expect(startInfo).toContain(r);
      const i = OTHER_NIGHT_ORDER.findIndex((s) => s.roleId === r);
      expect(OTHER_NIGHT_ORDER[i].note).toBe('Only if the ability was just gained');
      const near = OTHER_NIGHT_ORDER.slice(i - JUST_GAINED_ONLY.length, i + JUST_GAINED_ONLY.length + 1).map((s) => s.roleId);
      expect(near, r).toContain('grandmother');
    }
  });

  it('every role that resolves at night has a slot', () => {
    const slotted = new Set([...FIRST_NIGHT_ORDER, ...OTHER_NIGHT_ORDER].map((s) => s.roleId));
    const missing = Object.entries(BEHAVIOURS).filter(([id, b]) => b.resolve && !slotted.has(id)).map(([id]) => id);
    expect(missing).toEqual([]);
  });
});
