// What the rules hand the Storyteller's console: the data behind its labels, trackers and setup fields.
import { describe, expect, it } from 'vitest';
import { scene, type Scene } from '../scenario';
import { as, chosen } from './lib';

const cast = { ann: 'lil_monsta', bo: 'm1', cy: 't1', di: 't2', ed: 't3', fi: 't4', gu: 't5' };
const fields = { fields: { lil_monsta: { minion: 'baron' } } };

const player = (s: Scene, id: string) => s.g.grimoire().players.find((p) => p.id === id);
const ability = (s: Scene, id: string, role: string) => player(s, id)?.abilities.find((a) => a.roleId === role);

describe("moving Lil' Monsta's token by hand", () => {
  const held = (s: Scene) =>
    Object.values(s.state.abilities).find((a) => a.roleId === ('lil_monsta' as never) && a.origin.kind !== 'character')
      ?.holder;
  const move = (s: Scene, to: string) => {
    const spec = s.g.grimoire().dayActions.find((d) => d.action === 'move_token');
    if (!spec) throw new Error('No move_token action');
    s.g.st({
      type: 'day_action',
      abilityId: spec.abilityId,
      action: spec.action,
      values: [to],
      mode: 'accept',
    });
  };

  it('is a day action once the token exists, and not before', () => {
    const s = scene(cast, fields).start();
    expect(s.g.grimoire().dayActions.some((d) => d.action === 'move_token')).toBe(false);
    s.dawn();
    expect(s.g.grimoire().dayActions.some((d) => d.action === 'move_token')).toBe(true);
  });

  it('moves the token, and the Demon with it', () => {
    const s = scene(cast, fields).start().dawn();
    expect(player(s, 'ann')?.isDemon).toBe(true);
    move(s, 'bo');
    expect(held(s)).toEqual({ kind: 'player', id: 'bo' });
    expect(player(s, 'bo')?.isDemon).toBe(true);
    expect(player(s, 'ann')?.isDemon).toBe(false);
  });
});

describe('impairment causes', () => {
  it('a Poisoner names its source, the same way as its condition row', () => {
    const s = scene({ ann: 'imp', bo: 'poisoner', cy: 'empath', di: 't1', ed: 't2' }).start();
    s.submit({ bo: ['cy'] }).dawn();
    expect(player(s, 'cy')?.causes).toEqual(['poisoned:Poisoner']);
    expect(player(s, 'cy')?.conditions.map((c) => `${c.type}:${c.sourceLabel}`)).toEqual(['poisoned:Poisoner']);
  });

  it('one set by the Storyteller says so', () => {
    const s = scene({ ann: 'imp', bo: 'm1', cy: 't1', di: 't2', ed: 't3' }).start();
    s.g.st({ type: 'add_condition', target: as('cy'), condition: 'drunk' });
    expect(player(s, 'cy')?.causes).toEqual(['drunk:storyteller']);
  });

  it('the Drunk is impaired by their own role', () => {
    const s = scene({ ann: 'imp', bo: 'm1', cy: 'drunk', di: 't2', ed: 't3' }, { believed: { cy: 'empath' } }).start();
    expect(player(s, 'cy')?.causes).toEqual(['drunk:Drunk']);
  });
});

describe('the ability tracker', () => {
  it('marks a believed role as perceived only', () => {
    const s = scene({ ann: 'imp', bo: 'm1', cy: 'drunk', di: 't2', ed: 't3' }, { believed: { cy: 'slayer' } }).start();
    expect(ability(s, 'cy', 'slayer')?.perceivedOnly).toBe(true);
  });

  it('a Philosopher keeps a role they gain, as granted', () => {
    const s = scene({ ann: 'imp', bo: 'm1', cy: 'philosopher', di: 't2', ed: 't3' }).start();
    s.submit({ cy: ['fisherman'] }).dawn();
    expect(ability(s, 'cy', 'fisherman')).toMatchObject({ origin: 'granted', perceivedOnly: false, oncePerGame: true });
  });

  it.each(['assassin', 'seamstress', 'philosopher', 'huntsman', 'professor', 'virgin', 'golem', 'slayer'])(
    '%s is tracked by itself',
    (role) => {
      const s = scene({ ann: 'imp', bo: 'm1', cy: role, di: 't2', ed: 't3' }).start();
      expect(ability(s, 'cy', role)).toMatchObject({ oncePerGame: true, usageAuto: true });
    },
  );

  it.each(['artist', 'fool', 'fisherman'])('%s is ticked by hand', (role) => {
    const s = scene({ ann: 'imp', bo: 'm1', cy: role, di: 't2', ed: 't3' }).start();
    expect(ability(s, 'cy', role)).toMatchObject({ oncePerGame: true, usageAuto: false });
  });

  it.each(['virgin', 'golem', 'mastermind', 'psychopath', 'mayor', 'tea_lady', 'fisherman', 'zealot', 'organ_grinder'])(
    '%s has a day reminder',
    (role) => {
      const s = scene({ ann: 'imp', bo: 'm1', cy: role, di: 't2', ed: 't3' }).start();
      expect(ability(s, 'cy', role)?.reminder).toBeTruthy();
    },
  );
});

describe('the Cannibal summary', () => {
  const eat = (executed: string) => {
    const s = scene({ ann: 'imp', bo: 'poisoner', cy: 'cannibal', di: 'empath', ed: 't2' }).start().dawn();
    s.execute(executed);
    return s;
  };
  const summary = (s: Scene) => player(s, 'cy')?.abilities.flatMap((a) => a.summary);

  it('names the role eaten', () => {
    expect(summary(eat('di'))).toContain('Ate: Empath');
  });

  it('says when an evil player gives false information', () => {
    const s = eat('bo');
    expect(summary(s)).toContain('Ate: (none) (false information)');
    const abilityId = s.ability('cannibal');
    s.g.st({ type: 'day_action', abilityId, action: 'set_ability', values: ['empath'], mode: 'accept' });
    expect(summary(s)).toContain('Ate: Empath (false information)');
  });
});

describe('the Godfather setup field', () => {
  const field = (chars: Record<string, string>, outsiders: string) =>
    scene(chars, { fields: { godfather: { outsiders } } })
      .g.grimoire()
      .setup.fields.find((f) => f.field === 'outsiders');

  const eight = { ann: 'imp', bo: 'godfather', cy: 't1', di: 't2', ed: 't3', fi: 't4', gu: 't5', hy: 't6' };

  it('offers -1 while there is an Outsider to remove', () => {
    const f = field({ ...eight, hy: 'o1' }, '-1');
    expect(f?.value).toBe('-1');
    expect(f?.options.map((o) => o.id)).toEqual(['+1', '-1']);
  });

  it('shows a stored -1 as +1 once there is nothing to remove', () => {
    const s = scene({ ...eight, hy: 'o1' }, { fields: { godfather: { outsiders: '-1' } } });
    // The Vigormortis takes the only Outsider first, after the -1 was chosen.
    s.g.st({ type: 'assign_character', playerId: as('ann'), roleId: chosen('vigormortis') });
    const f = s.g.grimoire().setup.fields.find((x) => x.field === 'outsiders');
    expect(f?.value).toBe('+1');
    expect(f?.options.map((o) => o.id)).toEqual(['+1']);
  });
});
