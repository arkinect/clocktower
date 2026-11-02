// The Farmer (design.md section 14.4): when they die at night, an alive good player becomes a Farmer.
import { describe, expect, it } from 'vitest';
import { act, build, nextNight, resolve, runNight, submit, type TestGame } from './helpers';
import { actionSpecs, wakingRoles } from '../src/engine/actions';

/** Seats: Farmer, Imp, Poisoner, Empath, Sailor, Butler. Night 0 run: Night 1 open, the Imp attacking `target`. */
function night1(roles = ['farmer', 'imp', 'poisoner', 'empath', 'sailor', 'butler'], extra?: (g: TestGame) => void, seed = 42): TestGame {
  const g = build(roles, extra);
  runNight(g, {});
  nextNight(g, seed);
  return g;
}

const killFarmer = (g: TestGame, more: Record<string, Record<string, string[]>> = {}) =>
  submit(g, { [g.p.imp]: { imp: [g.p.farmer ?? g.p.drunk] }, ...more });
const item = (g: TestGame, pid: string) => g.s.night!.resolution!.reviewItems.find((i) => i.key === `farmer:${pid}`);

describe('Farmer', () => {
  it('dies at night: the Storyteller picks an alive good player (or nobody), who becomes a Farmer and stays good', () => {
    const g = night1();
    expect(wakingRoles(g.s, g.p.farmer)).toEqual([]);
    expect(actionSpecs(g.s, g.p.farmer)).toEqual([]);
    killFarmer(g);
    const res = resolve(g);
    expect(res.deaths).toEqual([g.p.farmer]);
    const pick = item(g, g.p.farmer)!;
    expect(pick.options.map((o) => o.id)).toEqual([g.p.empath, g.p.sailor, g.p.butler, 'nobody']);
    expect([g.p.empath, g.p.sailor, g.p.butler]).toContain(pick.default);
    resolve(g, { [`farmer:${g.p.farmer}`]: g.p.butler });
    act(g, { type: 'publish_night', force: true });
    expect(g.s.assignments[g.p.butler]).toMatchObject({ roleId: 'farmer', alignment: 'good' });
    expect(g.s.assignments[g.p.butler].history.at(-1)).toMatchObject({ from: 'butler', to: 'farmer', reason: 'became a Farmer' });
    expect(g.s.messages[g.p.butler].find((m) => m.title === 'You are now the Farmer'))
      .toMatchObject({ lines: ['When you die at night, an alive good player becomes a Farmer.'] });
  });

  it('the new Farmer doesn\'t act again tonight as their old role', () => {
    const g = night1();
    killFarmer(g, { [g.p.butler]: { butler: [g.p.empath] } });
    const res = resolve(g, { [`farmer:${g.p.farmer}`]: g.p.butler });
    expect(res.actors.some((a) => a.playerId === g.p.butler && a.roleId === 'butler')).toBe(false);
  });

  it('the default is never a player who is already a Farmer; with only Farmers left, it is nobody', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = night1(['farmer', 'imp', 'poisoner', 'empath', 'sailor'], (g) => { g.s.assignments[g.p.sailor].roleId = 'farmer'; }, seed);
      killFarmer(g);
      resolve(g);
      expect(item(g, g.p.farmer)!.default, `seed ${seed}`).toBe(g.p.empath);
    }
    const g = night1(['farmer', 'imp', 'poisoner', 'sailor', 'butler'], (g) => {
      g.s.assignments[g.p.sailor].roleId = 'farmer';
      g.s.assignments[g.p.butler].roleId = 'farmer';
    });
    killFarmer(g);
    resolve(g);
    expect(item(g, g.p.farmer)!.default).toBe('nobody');
  });

  it('Nobody: no role changes', () => {
    const g = night1();
    killFarmer(g);
    const res = resolve(g, { [`farmer:${g.p.farmer}`]: 'nobody' });
    expect(res.notices).toEqual([]);
    act(g, { type: 'publish_night', force: true });
    expect(Object.values(g.s.assignments).filter((a) => a.roleId === 'farmer')).toHaveLength(1);
  });

  it('a Farmer who dies by day does nothing', () => {
    const g = build(['farmer', 'imp', 'poisoner', 'empath', 'sailor', 'butler']);
    runNight(g, {});
    act(g, { type: 'record_execution', playerId: g.p.farmer, died: true });
    nextNight(g);
    const res = resolve(g);
    expect(item(g, g.p.farmer)).toBeUndefined();
    expect(res.actors.some((a) => a.roleId === 'farmer')).toBe(false);
  });

  it('a Farmer poisoned when they die does nothing (and their ability worked abnormally)', () => {
    const g = night1();
    killFarmer(g, { [g.p.poisoner]: { poisoner: [g.p.farmer] } });
    const res = resolve(g);
    expect(item(g, g.p.farmer)).toBeUndefined();
    expect(res.actors.find((a) => a.roleId === 'farmer')).toMatchObject({ impaired: true, outcome: 'drunk or poisoned when they died: nobody becomes a Farmer' });
    expect(res.abnormal).toContainEqual(expect.objectContaining({ playerId: g.p.farmer, detail: 'Farmer ability impaired' }));
  });

  it('a Drunk who thinks they are the Farmer does nothing when they die at night', () => {
    const g = night1(['drunk', 'imp', 'poisoner', 'empath', 'sailor', 'butler'], (g) => {
      act(g, { type: 'set_believed_role', playerId: g.p.drunk, roleId: 'farmer' });
    });
    killFarmer(g);
    const res = resolve(g);
    expect(item(g, g.p.drunk)).toBeUndefined();
    expect(res.actors.find((a) => a.roleId === 'farmer')).toMatchObject({ playerId: g.p.drunk, outcome: 'not really the Farmer: nobody becomes a Farmer' });
    expect(Object.values(g.s.night!.resolution!.after.assignments).some((a) => a.roleId === 'farmer')).toBe(false);
  });
});
