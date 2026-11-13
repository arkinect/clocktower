import { describe, expect, it } from 'vitest';
import { scene, type Scene } from '../scenario';

const cast = { ann: 'lil_monsta', bo: 'm1', cy: 't1', di: 't2', ed: 't3', fi: 't4', gu: 't5' };
const opts = { fields: { lil_monsta: { minion: 'baron' } } };
const part = (s: Scene, p: 'token' | 'keeper') =>
  Object.values(s.state.abilities).find(
    (a) =>
      a.roleId === ('lil_monsta' as never) &&
      a.origin.kind !== 'character' &&
      a.activeUntil !== 'removed' &&
      (a.state as { part: string }).part === p,
  );
const babysitter = (s: Scene) => part(s, 'token')?.holder;
const isDemon = (s: Scene, id: string) => s.g.grimoire().players.find((p) => p.id === id)?.isDemon;

describe("Lil' Monsta", () => {
  it('needs a Minion chosen at setup', () => {
    const s = scene(cast);
    expect(s.g.grimoire().setup.checklist.find((c) => c.id === 'lil_monsta')?.done).toBe(false);
  });
  it('comes with no bluffs: none asked for at setup, none shown', () => {
    const s = scene(cast, opts);
    expect(s.g.grimoire().setup.checklist.some((c) => c.id === 'bluffs')).toBe(false);
    s.g.st({ type: 'suggest_bluffs' });
    s.start();
    expect(s.inbox('ann').join(' ')).not.toMatch(/bluffs/);
  });
  it('the extra Minion is that player, so the counts do not change', () => {
    expect(scene(cast).g.grimoire().setup.counts.target[2]).toBe(1);
  });
  it('becomes the chosen Minion at the first dawn, babysitting the token and keeping the choice of who does', () => {
    const s = scene(cast, opts).start().dawn();
    expect(s.character('ann')).toBe('baron');
    expect(s.inbox('ann')).toContain("You hold Lil' Monsta's token. You are the Demon.");
    expect(isDemon(s, 'ann')).toBe(true);
    expect(part(s, 'keeper')?.holder).toEqual({ kind: 'player', id: 'ann' });
  });
  it('the keeper chooses any living player to babysit; the Storyteller chooses who dies', () => {
    const s = scene(cast, opts).start().nextNight();
    expect(s.specs('ann')[0]?.fields.map((f) => f.label)).toEqual(['Babysitter']);
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'di')
      .dawn();
    expect(s.alive('di')).toBe(false);
    expect(babysitter(s)).toEqual({ kind: 'player', id: 'cy' });
    expect(isDemon(s, 'cy')).toBe(true);
    expect(isDemon(s, 'ann')).toBe(false);
  });
  it('a good babysitter is never told, stays good and does not choose; the keeper takes the token back', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.alignment('cy')).toBe('good');
    expect(s.inbox('cy').join(' ')).not.toMatch(/Lil' Monsta|Demon/);
    s.dusk();
    expect(s.specs('cy')).toEqual([]);
    s.submit({ ann: ['ann'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(babysitter(s)).toEqual({ kind: 'player', id: 'ann' });
    expect(s.inbox('cy').join(' ')).not.toMatch(/Lil' Monsta|Demon/);
  });
  it('the evil team is told who babysits, in the third person, and nothing else', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['bo'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.inbox('bo')).toContain("bo is babysitting Lil' Monsta.");
    s.dusk()
      .submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.inbox('bo')).toContain("cy is babysitting Lil' Monsta.");
    expect(s.inbox('bo').join(' ')).not.toMatch(/You babysit|no longer|You are the Demon/);
    // The keeper chose it, so is not told.
    expect(s.inbox('ann').join(' ')).not.toMatch(/is babysitting/);
  });
  it('the victim list leaves out the babysitter and offers nobody', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['bo'] }).review();
    const ids = s.decision('lil_monsta').options.map((o) => o.id);
    expect(ids).toContain('none');
    expect(ids).not.toContain('bo');
    expect(ids).toContain('ann');
  });
  it('nobody may die', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['ann'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(Object.keys(cast).every((id) => s.alive(id))).toBe(true);
  });
  it('a poisoned babysitter kills nobody', () => {
    const s = scene({ ...cast, bo: 'poisoner' }, opts)
      .start()
      .nextNight();
    s.submit({ bo: ['cy'], ann: ['cy'] }).review();
    expect(s.hasDecision('lil_monsta')).toBe(false);
    s.dawn();
    expect(Object.keys(cast).every((id) => s.alive(id))).toBe(true);
  });
  it('executing the babysitter kills the Demon', () => {
    const s = scene(cast, opts).start().dawn();
    s.execute('ann').dusk();
    expect(s.winners()).toContain('good');
  });
  it('a dead keeper still chooses the babysitter', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['bo'] })
      .decide('lil_monsta', 'none')
      .dawn();
    s.execute('ann').dusk();
    expect(s.specs('ann')[0]?.fields.map((f) => f.label)).toEqual(['Babysitter']);
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'di')
      .dawn();
    expect(babysitter(s)).toEqual({ kind: 'player', id: 'cy' });
    expect(s.alive('di')).toBe(false);
  });
  it('a babysitter can still be turned evil by the Mezepheles', () => {
    const s = scene(
      { ...cast, bo: 'mezepheles' },
      { fields: { lil_monsta: { minion: 'baron' }, mezepheles: { word: 'apple' } } },
    )
      .start()
      .nextNight();
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    s.act('mezepheles', 'sayer', ['cy']);
    s.dusk()
      .submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.alignment('cy')).toBe('evil');
    expect(isDemon(s, 'cy')).toBe(true);
  });
});
