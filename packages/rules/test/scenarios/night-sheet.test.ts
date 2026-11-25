// The night sheet as data: what acts before what, and where single characters sit.
import { describe, expect, it } from 'vitest';
import { allRoles } from '../../src';
import { nightSheet } from '../../src/abilities/registry';

describe('the night sheet', () => {
  const MODIFIERS = ['philosopher', 'sailor', 'poisoner', 'innkeeper'];
  const DEMONS = [
    'imp',
    'pukka',
    'shabaloth',
    'po',
    'no_dashii',
    'vigormortis',
    'al_hadikhia',
    'lil_monsta',
    'witch_king',
  ];
  const KILLS = [...DEMONS, 'gambler', 'assassin', 'godfather', 'gossip', 'moonchild'];
  const INFORMATION = [
    'clockmaker',
    'empath',
    'fortune_teller',
    'flowergirl',
    'oracle',
    'seamstress',
    'juggler',
    'balloonist',
    'grandmother',
    'mathematician',
  ];
  const real = (n: number) =>
    nightSheet(n)
      .map((r) => r.id as string)
      .filter((r) => !r.startsWith('t-'));
  const before = (order: string[], a: string[], b: string[]) => {
    for (const x of a) {
      for (const y of b) {
        if (x !== y && order.includes(x) && order.includes(y)) {
          expect(order.indexOf(x), `${x} before ${y}`).toBeLessThan(order.indexOf(y));
        }
      }
    }
  };

  it.each([
    ['first night', 0],
    ['other nights', 1],
  ])('%s: each group in its place, and every role once', (_name, n) => {
    const order = real(n);
    const first = MODIFIERS.filter((r) => order.includes(r));
    expect(order.slice(0, first.length)).toEqual(first);
    before(order, KILLS, ['ravenkeeper', ...INFORMATION]);
    before(
      order,
      KILLS.filter((k) => k !== 'moonchild'),
      ['professor'],
    );
    before(order, ['professor'], ['empath', 'oracle']);
    before(order, DEMONS, ['grandmother']);
    expect(order.at(-1)).toBe('mathematician');
    expect(new Set(order).size).toBe(order.length);
  });

  it('the Demon group above has every Demon', () => {
    const demons = allRoles().filter((r) => r.type === 'demon' && !r.id.startsWith('t-'));
    expect(demons.map((r) => r.id as string).sort()).toEqual([...DEMONS].sort());
  });

  it('the Organ Grinder per the official sheet', () => {
    const [first, other] = [real(0), real(1)];
    expect(first.indexOf('organ_grinder')).toBe(first.indexOf('godfather') + 1);
    expect(first.indexOf('devils_advocate')).toBe(first.indexOf('organ_grinder') + 1);
    expect(other.indexOf('organ_grinder')).toBe(other.indexOf('gambler') + 1);
    expect(other.indexOf('devils_advocate')).toBe(other.indexOf('organ_grinder') + 1);
  });

  it("the Al-Hadikhia: other nights only, between the Vigormortis and the Lil' Monsta", () => {
    const [first, other] = [real(0), real(1)];
    expect(first).not.toContain('al_hadikhia');
    expect(other.indexOf('al_hadikhia')).toBe(other.indexOf('vigormortis') + 1);
    expect(other.indexOf('lil_monsta')).toBe(other.indexOf('al_hadikhia') + 1);
  });

  it('the Farmer: other nights only, after the Huntsman, before the Moonchild and Grandmother', () => {
    const [first, other] = [real(0), real(1)];
    expect(first).not.toContain('farmer');
    expect(other.indexOf('farmer')).toBe(other.indexOf('huntsman') + 1);
    expect(other.indexOf('moonchild')).toBe(other.indexOf('farmer') + 1);
    before(other, DEMONS, ['farmer']);
    before(other, ['farmer'], ['grandmother']);
  });

  it('every role that resolves at night has a slot', () => {
    const slotted = new Set([...real(0), ...real(1)]);
    const missing = allRoles().filter((r) => r.ability.resolve && !r.id.startsWith('t-') && !slotted.has(r.id));
    expect(missing.map((r) => r.id)).toEqual([]);
  });
});
