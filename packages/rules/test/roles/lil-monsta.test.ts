import { describe, expect, it } from 'vitest';
import { roleId } from '@ct/protocol';
import type { GameStateT } from '../../src';
import { Run } from '../../src/night/run';
import { clone } from '../../src/util/clone';
import { pid, ST } from '../helpers/game';
import { scene, type Scene } from '../scenario';

const cast = { ann: 'lil_monsta', bo: 'm1', cy: 't1', di: 't2', ed: 't3', fi: 't4', gu: 't5' };
const opts = { fields: { lil_monsta: { minion: 'baron' } } };
const part = (s: Scene, p: 'token' | 'keeper') =>
  [...s.state.abilities.values()].find(
    (a) =>
      a.roleId === ('lil_monsta' as never) &&
      a.origin.kind !== 'character' &&
      a.activeUntil !== 'removed' &&
      (a.state as { part: string }).part === p,
  );
const babysitter = (s: Scene) => part(s, 'token')?.holder;
const isDemon = (s: Scene, id: string) => s.g.grimoire().players.find((p) => p.id === pid(id))?.isDemon;

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
  it('learns the Minions, who learn only each other', () => {
    const s = scene({ ...cast, cy: 'm2' }, opts).start();
    expect(s.inbox('ann').join(' ')).toMatch(/Minions/);
    expect(s.g.view(pid('cy')).me.messages.map((m) => m.title)).toEqual(['Your fellow Minions']);
  });
  it('comes with no bluffs: none asked for at setup, none shown', () => {
    const s = scene(cast, opts);
    expect(s.g.grimoire().setup.checklist.some((c) => c.id === 'bluffs')).toBe(false);
    s.g.st({ type: 'suggest_bluffs' });
    s.start();
    expect(s.inbox('ann').join(' ')).not.toMatch(/bluffs/);
  });
  it('becomes the chosen Minion at the first dawn, babysitting the token and keeping the choice of who does', () => {
    const s = scene(cast, opts).start().dawn();
    expect(s.character('ann')).toBe('baron');
    expect(s.inbox('ann')).toContain("You hold Lil' Monsta's token. You are the Demon.");
    expect(isDemon(s, 'ann')).toBe(true);
    expect(part(s, 'keeper')?.holder).toEqual({ kind: 'player', id: pid('ann') });
  });
  it('the keeper chooses any living player to babysit; the Storyteller chooses who dies', () => {
    const s = scene(cast, opts).start().nextNight();
    expect(s.specs('ann')[0]?.fields.map((f) => f.label)).toEqual(['Babysitter']);
    s.submit({ ann: ['cy'] })
      .decide('lil_monsta', 'di')
      .dawn();
    expect(s.alive('di')).toBe(false);
    expect(babysitter(s)).toEqual({ kind: 'player', id: pid('cy') });
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
    expect(Object.keys(cast).every((id) => s.alive(id))).toBe(true);
    expect(s.alignment('cy')).toBe('good');
    expect(told(s, 'cy')).toBe(true);
    expect(s.inbox('di').join(' ')).not.toMatch(/Monsta|babysit/);
    s.dusk();
    expect(s.specs('cy')).toEqual([]);
    s.submit({ ann: ['ann'] })
      .decide('lil_monsta', 'none')
      .dawn();
    expect(babysitter(s)).toEqual({ kind: 'player', id: pid('ann') });
    // Nothing more: a good player is never told where the token went.
    expect(s.inbox('cy').filter((x) => /babysit/.test(x))).toHaveLength(1);
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
  it('a Marionette is not told who babysits; one who babysits kills, told just what a good player is', () => {
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
      .decide('lil_monsta', 'di');
    expect(s.impaired('bo')).toBe(true);
    s.dawn();
    expect(s.alive('di')).toBe(false);
    const notice = (id: string) => s.g.view(pid(id)).me.messages.findLast((m) => m.title === "Lil' Monsta");
    expect(notice('bo')?.lines).toEqual(TOLD);
    expect(notice('bo')?.lines).toEqual(notice('cy')?.lines);
    expect(s.g.view(pid('bo') as never).me.role?.name).toBe('Empath');
  });
  it('the victim list leaves out the babysitter and offers nobody', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['bo'] }).review();
    const ids = s.decision('lil_monsta').options.map((o) => o.id);
    expect(ids).toContain('none');
    expect(ids).not.toContain(pid('bo'));
    expect(ids).toContain(pid('ann'));
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
  it('a poisoned keeper still chooses, and the Review row does not call it poisoned', () => {
    const s = scene({ ...cast, bo: 'poisoner' }, opts)
      .start()
      .nextNight();
    s.submit({ bo: ['ann'], ann: ['cy'] }).decide('lil_monsta', 'di');
    expect(s.res.actors.find((a) => a.roleId === 'lil_monsta')).toMatchObject({ impaired: false, causes: [] });
    s.dawn();
    expect(s.impaired('ann')).toBe(true);
    expect(babysitter(s)).toEqual({ kind: 'player', id: pid('cy') });
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
  it('a Fortune Teller reads whoever babysits as the Demon', () => {
    const s = scene(
      { ...cast, cy: 'fortune_teller' },
      { fields: { ...opts.fields, fortune_teller: { herring: 'di' } } },
    )
      .start()
      .nextNight();
    s.submit({ ann: ['bo'], cy: ['bo', 'ed'] }).decide('lil_monsta', 'none');
    expect(s.truth('cy')[0]).toMatch(/Yes/);
    s.nextNight();
    s.submit({ ann: ['gu'], cy: ['bo', 'ed'] }).decide('lil_monsta', 'none');
    expect(s.truth('cy')[0]).toMatch(/No/);
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
    expect(babysitter(s)).toEqual({ kind: 'player', id: pid('cy') });
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
  it('the token stays when its babysitter becomes the Farmer', () => {
    // Found by the whole autoplay games: the token went, and with it the Demon, so the game could never end.
    const world = clone(scene({ ...cast, bo: 'farmer' }, opts).state) as GameStateT;
    const run = new Run({ world, moment: { kind: 'night', n: 0 }, seed: 1, now: 0 });
    run.grant({ kind: 'player', id: pid('cy') }, roleId('lil_monsta'), { kind: 'granted', by: 'test' } as never, {
      state: { part: 'token', heir: null },
    });
    expect(run.reader.isDemon(pid('cy'))).toBe(true);
    run.changeCharacter(pid('cy'), roleId('farmer'), { reason: 'became a Farmer', keepGranted: false });
    expect(run.reader.isDemon(pid('cy'))).toBe(true);
  });
});
