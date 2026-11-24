import { describe, expect, it } from 'vitest';
import { ST } from '../helpers/game';
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
  it('cannot become a Minion in play, or the Marionette, who would know what they are', () => {
    const s = scene({ ...cast, bo: 'poisoner' });
    const field = () => s.g.grimoire().setup.fields.find((f) => f.field === 'minion');
    const ids = field()?.options.map((o) => o.id) ?? [];
    expect(ids).toContain('baron');
    expect(ids).not.toContain('poisoner');
    expect(ids).not.toContain('marionette');
    const set = (value: string) =>
      s.g.tryAs(ST, {
        type: 'set_setup_field',
        abilityId: s.ability('lil_monsta'),
        field: 'minion',
        value,
      });
    expect(set('marionette').ok).toBe(false);
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
  const TOLD = [
    "You are babysitting Lil' Monsta. Whoever babysits it is the Demon.",
    'Babysitting does not change your alignment.',
  ];
  const told = (s: Scene, id: string) => TOLD.every((line) => s.inbox(id).includes(line));
  it('a good babysitter is told, stays good and does not choose; the keeper takes the token back', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.alignment('cy')).toBe('good');
    expect(told(s, 'cy')).toBe(true);
    s.dusk();
    expect(s.specs('cy')).toEqual([]);
    s.submit({ ann: ['ann'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(babysitter(s)).toEqual({ kind: 'player', id: 'ann' });
    // Nothing more: a good player is never told where the token went.
    expect(s.inbox('cy').filter((x) => /babysit/.test(x))).toHaveLength(1);
  });
  it('a good player who does not babysit is told nothing', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.inbox('di').join(' ')).not.toMatch(/Monsta|babysit/);
  });
  it('the evil team is told who babysits, and an evil babysitter that it is them', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['bo'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(told(s, 'bo')).toBe(true);
    expect(s.inbox('bo').join(' ')).not.toMatch(/bo is babysitting/);
    s.dusk()
      .submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.inbox('bo')).toContain("cy is babysitting Lil' Monsta.");
    // The keeper chose it, so is not told.
    expect(s.inbox('ann').join(' ')).not.toMatch(/is babysitting|are babysitting/);
  });
  it('a Marionette is not told who babysits, and one who babysits is told just what a good player is', () => {
    const s = scene({ ...cast, bo: 'marionette', gu: 'm2' }, { ...opts, believed: { bo: 'empath' } })
      .start()
      .nextNight();
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(s.inbox('gu')).toContain("cy is babysitting Lil' Monsta.");
    expect(s.inbox('bo').join(' ')).not.toMatch(/Monsta|babysit/);
    s.dusk()
      .submit({ ann: ['bo'] })
      .dawn();
    const notice = (id: string) => s.g.view(id as never).me.messages.findLast((m) => m.title === "Lil' Monsta");
    expect(notice('bo')?.lines).toEqual(TOLD);
    expect(notice('bo')?.lines).toEqual(notice('cy')?.lines);
    expect(s.g.view('bo' as never).me.role?.name).toBe('Empath');
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
  it('cannot be poisoned: a poisoned babysitter still kills, and only their own ability fails', () => {
    const s = scene({ ...cast, bo: 'poisoner', cy: 'empath' }, opts)
      .start()
      .nextNight();
    s.submit({ bo: ['cy'], ann: ['cy'] }).decide('lil_monsta', 'di');
    expect(s.row('cy').impaired).toBe(true);
    s.dawn();
    expect(s.impaired('cy')).toBe(true);
    expect(s.alive('di')).toBe(false);
  });
  it('a Marionette who babysits kills too', () => {
    const s = scene({ ...cast, bo: 'marionette' }, { ...opts, believed: { bo: 'empath' } })
      .start()
      .nextNight();
    s.submit({ ann: ['bo'] }).decide('lil_monsta', 'di');
    expect(s.impaired('bo')).toBe(true);
    s.dawn();
    expect(s.alive('di')).toBe(false);
  });
  it('a poisoned keeper still chooses, and the Review row does not call it poisoned', () => {
    const s = scene({ ...cast, bo: 'poisoner' }, opts)
      .start()
      .nextNight();
    s.submit({ bo: ['ann'], ann: ['cy'] }).decide('lil_monsta', 'di');
    expect(s.res.actors.find((a) => a.roleId === 'lil_monsta')).toMatchObject({ impaired: false, causes: [] });
    s.dawn();
    expect(s.impaired('ann')).toBe(true);
    expect(babysitter(s)).toEqual({ kind: 'player', id: 'cy' });
    expect(s.alive('di')).toBe(false);
  });
  it('a poisoned babysitter is no malfunction, unless their own ability goes wrong', () => {
    const s = scene({ ...cast, bo: 'poisoner', gu: 'mathematician' }, opts)
      .start()
      .nextNight();
    // cy is a plain Townsfolk with nothing to go wrong.
    s.submit({ bo: ['cy'], ann: ['cy'] }).decide('lil_monsta', 'none');
    expect(s.truth('gu')).toEqual(["0 players' abilities worked abnormally."]);
  });
  it('a dead babysitter kills nobody', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['cy'] });
    s.kill('cy');
    s.review();
    expect(s.hasDecision('lil_monsta')).toBe(false);
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
