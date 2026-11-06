// The Philosopher, start information, and characters revived or gained part way through a night.
import { describe, expect, it } from 'vitest';
import { as, open, row, shootAs, titles } from './lib';
import { scene, ST, type Scene } from '../scenario';

const cast = { ann: 'philosopher', bo: 'imp', cy: 'poisoner', di: 'butler', ed: 'virgin' };
const ONE_STEP = ['The Demon is 1 step from its nearest Minion.'];
const result = (s: Scene, id: string, role: string) =>
  s.res.results.find((r) => r.playerId === id && r.roleId === role);
const gained = (s: Scene, id: string, role: string) =>
  Object.values(s.state.abilities).some(
    (a) => a.holder.kind === 'player' && a.holder.id === id && a.roleId === role && a.activeUntil !== 'removed',
  );

/** The Philosopher waits on night 0 and chooses on night 1, with the night's other choices given. */
const choosesOnNight1 = (role: string, others: Record<string, string[]> = {}, chars: Record<string, string> = cast) =>
  scene(chars)
    .start()
    .submit({ ann: [] })
    .nextNight()
    .submit({ ann: [role], ...others })
    .review();

describe('the Philosopher choosing', () => {
  it('a chosen Empath gives a result that night, on night 0 and on a later night', () => {
    expect(
      result(
        scene(cast)
          .start()
          .submit({ ann: ['empath'] }),
        'ann',
        'empath',
      ),
    ).toBeDefined();
    const s = scene(cast).start().submit({ ann: [] }).nextNight().submit({ ann: [] }).nextNight();
    expect(result(s.submit({ ann: ['empath'] }), 'ann', 'empath')).toBeDefined();
  });

  it('a gained ability with input is a follow-up: publishing waits, and the answer resolves at its slot', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['fortune_teller'] })
      .review();
    expect(s.res.questions).toMatchObject([{ playerId: 'ann', roleId: 'fortune_teller', answered: false }]);
    expect(row(s, 'ann', 'fortune_teller')?.outcome).toMatch(/^waiting/);
    expect(result(s, 'ann', 'fortune_teller')).toBeUndefined();
    expect(s.g.tryAs(ST, { type: 'publish_dawn', force: false }).ok).toBe(false);
    s.answer('ann', ['bo', 'di']);
    expect(result(s, 'ann', 'fortune_teller')?.final[0]).toMatch(/Yes/);
    s.g.st({ type: 'publish_dawn', force: false });
    expect(s.state.phase.kind).toBe('day');
  });

  it('the Storyteller can answer the gained Sailor question, and it takes effect at the Sailor slot', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['sailor'] })
      .review();
    const key = s.res.questions[0]?.key as string;
    s.g.st({ type: 'answer_question_for', key, choice: { values: ['di'] } });
    s.decide('sailor', 'di').dawn();
    expect(s.impaired('di')).toBe(true);
  });

  it('a gained passive works that night', () => {
    const s = choosesOnNight1('sailor', { bo: ['ann'] });
    expect(s.res.deaths).toEqual([]);
  });

  it('the choice drunks the in-play holder before their own slot', () => {
    const s = scene({ ...cast, ed: 'empath' })
      .start()
      .submit({ ann: ['empath'] })
      .review();
    expect(s.row('ed')).toMatchObject({ impaired: true });
    expect(s.row('ed').causes.join(' ')).toMatch(/Philosopher|philosopher/);
  });

  it('a Goon chosen through a late question triggers as normal', () => {
    const s = scene({ ...cast, ed: 'goon' })
      .start()
      .submit({ ann: ['fortune_teller'] })
      .review();
    s.g.st({ type: 'answer_question_for', key: s.res.questions[0]?.key as string, choice: { values: ['ed', 'di'] } });
    expect(result(s, 'ann', 'fortune_teller')?.impaired).toBe(true);
    s.dawn();
    expect(s.alignment('ed')).toBe('good');
    expect(s.impaired('ann')).toBe(true);
  });

  it('a chosen Professor offers only those dead when the night began and still dead', () => {
    const s = scene({ ...cast, fi: 'empath', gus: 'flowergirl' })
      .start()
      .submit({ ann: [] })
      .dawn();
    s.g.st({ type: 'mark_alive', playerId: as('ed'), alive: false });
    s.dusk()
      .submit({ ann: ['professor'], bo: ['fi'] })
      .review();
    expect(s.res.questions[0]?.roleId).toBe('professor');
    expect(s.res.questions[0]?.spec.fields[0]?.options).toEqual(['ed']);
  });

  it('reopening collecting clears the late answers', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['fortune_teller'] })
      .review();
    s.g.st({ type: 'answer_question_for', key: s.res.questions[0]?.key as string, choice: { values: ['bo', 'di'] } });
    s.g.st({ type: 'reopen_collecting' });
    s.review();
    expect(open(s)).toHaveLength(1);
  });

  it('stays hidden even if the used chip is toggled back to Unused', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['fortune_teller'] })
      .dawn();
    s.g.st({ type: 'set_ability_used', abilityId: s.ability('philosopher'), used: false });
    s.dusk();
    expect(s.specs('ann').map((x) => x.roleId)).toEqual(['fortune_teller']);
  });
});

describe('the held character drunkenness', () => {
  const held = () => {
    const s = scene({ ...cast, ed: 'empath' })
      .start()
      .submit({ ann: ['empath'] })
      .dawn();
    expect(s.impaired('ed')).toBe(true);
    return s;
  };

  it('pauses while the Philosopher is poisoned, and comes back once they are sober', () => {
    const s = held()
      .dusk()
      .submit({ cy: ['ann'] });
    expect(s.row('ed').impaired).toBe(false);
    s.dawn();
    expect(s.impaired('ed')).toBe(false);
    s.dusk();
    expect(s.impaired('ed')).toBe(true);
  });

  it('pauses while the Philosopher is drunk', () => {
    const s = held();
    s.g.st({ type: 'add_condition', target: as('ann'), condition: 'drunk' });
    expect(s.impaired('ed')).toBe(false);
  });

  it('ends for good once the Philosopher dies', () => {
    const s = held();
    s.g.st({ type: 'mark_alive', playerId: as('ann'), alive: false });
    expect(s.impaired('ed')).toBe(false);
    s.dusk();
    expect(s.impaired('ed')).toBe(false);
  });
});

describe('start information', () => {
  it('a Philosopher who chooses the Clockmaker learns the distance that night, once', () => {
    const s = choosesOnNight1('clockmaker');
    expect(result(s, 'ann', 'clockmaker')).toMatchObject({
      title: 'Clockmaker',
      truth: ONE_STEP,
      final: ONE_STEP,
      impaired: false,
    });
    s.dawn();
    expect(titles(s, 'ann').slice(-2)).toEqual(['Philosopher', 'Clockmaker']);
    s.dusk();
    expect(s.specs('ann')).toEqual([]);
    expect(result(s, 'ann', 'clockmaker')).toBeUndefined();
  });

  it('chosen on night 0, it comes on night 0 only', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['clockmaker'] });
    expect(result(s, 'ann', 'clockmaker')?.truth).toEqual(ONE_STEP);
    s.nextNight();
    expect(result(s, 'ann', 'clockmaker')).toBeUndefined();
  });

  it('a real Clockmaker wakes on night 0 only, and the Philosopher copy does not wake them', () => {
    const chars = { ...cast, di: 'clockmaker' };
    const s = scene(chars).start().submit({ ann: [] });
    expect(result(s, 'di', 'clockmaker')).toBeDefined();
    s.nextNight().submit({ ann: ['clockmaker'] });
    expect(result(s, 'ann', 'clockmaker')).toBeDefined();
    expect(result(s, 'di', 'clockmaker')).toBeUndefined();
    s.nextNight();
    expect(result(s, 'ann', 'clockmaker')).toBeUndefined();
  });

  it('poisoned after choosing the Clockmaker: false information, and it does not come again', () => {
    const s = choosesOnNight1('clockmaker', { cy: ['ann'] });
    const line = result(s, 'ann', 'clockmaker');
    expect(line?.impaired).toBe(true);
    expect(line?.truth).toEqual(ONE_STEP);
    expect(line?.suggested).not.toEqual(ONE_STEP);
    expect(line?.suggested[0]).toMatch(/^The Demon is \d steps? from its nearest Minion\.$/);
    s.dawn();
    expect(gained(s, 'ann', 'clockmaker')).toBe(true);
    s.dusk();
    expect(result(s, 'ann', 'clockmaker')).toBeUndefined();
  });

  it('the Huntsman Damsel turned Clockmaker learns the distance that night, once', () => {
    const s = scene({ ann: 'huntsman', bo: 'imp', cy: 'poisoner', di: 'damsel', ed: 'empath', fi: 'butler' }).start();
    s.submit({ ann: [] })
      .nextNight()
      .submit({ ann: ['di'] })
      .decide('huntsman_new_role', 'clockmaker');
    expect(result(s, 'di', 'clockmaker')).toMatchObject({ title: 'Clockmaker', truth: ONE_STEP, impaired: false });
    s.nextNight();
    expect(s.specs('di')).toEqual([]);
    expect(result(s, 'di', 'clockmaker')).toBeUndefined();
  });

  it('the Damsel turned Grandmother gets the information and no link that night', () => {
    const s = scene({ ann: 'huntsman', bo: 'imp', cy: 'poisoner', di: 'damsel', ed: 'empath', fi: 'butler' }).start();
    s.submit({ ann: ['di'] }).decide('huntsman_new_role', 'grandmother');
    expect(result(s, 'di', 'grandmother')).toBeDefined();
    expect(s.hasDecision('grandmother_link')).toBe(false);
  });

  it('a Damsel turned Townsfolk does not act that night', () => {
    const s = scene({ ann: 'huntsman', bo: 'imp', cy: 'poisoner', di: 'damsel', ed: 't1', fi: 'butler' }).start();
    s.submit({ ann: ['di'] }).decide('huntsman_new_role', 'empath');
    expect(s.res.questions).toEqual([]);
    expect(result(s, 'di', 'empath')).toBeUndefined();
  });

  it('a Philosopher-Grandmother learns a grandchild that night, and the link works from the next night', () => {
    const s = choosesOnNight1('grandmother', { bo: ['ed'] }).decide('grandmother_grandchild', 'ed');
    expect(result(s, 'ann', 'grandmother')?.truth).toEqual(['Your grandchild is ed, the Virgin.']);
    expect(s.hasDecision('grandmother_link')).toBe(false);
    expect(s.res.deaths).toEqual(['ed']);
    s.nextNight();
    expect(s.hasDecision('grandmother_grandchild')).toBe(false);
    const t = choosesOnNight1('grandmother')
      .decide('grandmother_grandchild', 'di')
      .nextNight()
      .submit({ bo: ['di'] })
      .dawn();
    expect(t.alive('ann')).toBe(false);
  });

  it('a gained ability without start information works that night and every night', () => {
    const s = choosesOnNight1('empath');
    expect(result(s, 'ann', 'empath')).toBeDefined();
    s.nextNight();
    expect(result(s, 'ann', 'empath')).toBeDefined();
  });
});

describe('players revived at night act later that night only with no input', () => {
  const revives = (victim: string) => {
    const s = scene({ ann: 'professor', bo: victim, cy: 'imp', di: 'poisoner', ed: 'butler' }).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: as('bo'), alive: false });
    return s
      .dusk()
      .submit({ ann: ['bo'] })
      .review();
  };

  it('an Empath gets a result that night', () => {
    const s = revives('empath');
    expect(s.res.revived).toEqual(['bo']);
    expect(s.res.questions).toEqual([]);
    expect(result(s, 'bo', 'empath')).toBeDefined();
  });

  it('a Fortune Teller gets no question, publishing does not wait, and they act the next night', () => {
    const s = revives('fortune_teller');
    expect(s.res.revived).toEqual(['bo']);
    expect(s.res.questions).toEqual([]);
    expect(s.res.actors.some((a) => a.playerId === 'bo')).toBe(false);
    s.g.st({ type: 'publish_dawn', force: false });
    s.dusk().submit({ bo: ['cy', 'ed'] });
    expect(result(s, 'bo', 'fortune_teller')?.final[0]).toMatch(/Yes/);
  });

  it('a Sailor whose slot has passed does not act', () => {
    const s = revives('sailor');
    expect(s.res.revived).toEqual(['bo']);
    expect(s.res.questions).toEqual([]);
    expect(s.res.actors.some((a) => a.playerId === 'bo')).toBe(false);
  });

  it('the Shabaloth regurgitates a Fortune Teller, who is asked nothing that night', () => {
    const s = scene({
      ann: 'shabaloth',
      bo: 'fortune_teller',
      cy: 'poisoner',
      di: 'butler',
      ed: 'virgin',
      fi: 'empath',
      gus: 'flowergirl',
    })
      .start()
      .nextNight()
      .submit({ ann: ['bo', 'ed'] })
      .nextNight()
      .submit({ ann: ['di', 'fi'] })
      .decide('shabaloth', 'bo');
    expect(s.res.revived).toEqual(['bo']);
    expect(s.res.questions).toEqual([]);
  });
});

describe('a gained day ability works on the day after choosing', () => {
  const chars = { ann: 'philosopher', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler', fi: 'sailor' };
  const slayer = (over: Record<string, string> = {}) =>
    scene({ ...chars, ...over })
      .start()
      .submit({ ann: [] })
      .nextNight()
      .submit({ ann: ['slayer'] })
      .dawn();

  it('no shot before they have it, or with another ability', () => {
    const s = scene(chars)
      .start()
      .submit({ ann: ['empath'] })
      .dawn();
    expect(s.dayActions().filter((a) => a.title.includes('Slayer'))).toEqual([]);
  });

  it('the shot lands, and is spent', () => {
    const s = slayer();
    expect(s.act('slayer', 'shoot', ['bo'], { mode: 'preview' }).effective).toBe(true);
    s.act('slayer', 'shoot', ['bo']);
    expect(s.alive('bo')).toBe(false);
    expect(s.dayActions().filter((a) => a.title.includes('Slayer'))).toEqual([]);
  });

  it('the real Slayer is drunk that day, and their shot does nothing', () => {
    const s = slayer({ ed: 'slayer' });
    expect(s.act('slayer', 'shoot', ['bo'], { mode: 'preview', holder: 'ed' }).effective).toBe(false);
    expect(s.act('slayer', 'shoot', ['bo'], { mode: 'preview', holder: 'ann' }).effective).toBe(true);
  });

  const witch = { ann: 'philosopher', bo: 'imp', cy: 'witch', di: 'empath', ed: 'clockmaker', fi: 'mayor' };
  const cursed = (role: string, target = 'ann', chars2 = witch) =>
    scene(chars2)
      .start()
      .submit({ ann: [role], cy: [target] })
      .dawn();

  it('the chosen Sailor survives the Witch curse', () => {
    const s = cursed('sailor');
    expect(s.act('witch', 'apply_curse', ['ann'], { mode: 'preview' }).effective).toBe(false);
    s.act('witch', 'apply_curse', ['ann']);
    expect(s.alive('ann')).toBe(true);
  });

  it('the chosen Fool survives the Witch curse by spending the Fool', () => {
    const s = cursed('fool');
    expect(s.act('witch', 'apply_curse', ['ann'], { mode: 'preview' }).effective).toBe(false);
    s.act('witch', 'apply_curse', ['ann']);
    expect(s.alive('ann')).toBe(true);
    expect(s.state.abilities[s.ability('fool', 'ann')]?.used).toBe(true);
  });

  it('the chosen Tea Lady protects a good neighbour from the curse', () => {
    const s = cursed('tea_lady', 'bo', { ...witch, bo: 'empath', di: 'imp' });
    expect(s.act('witch', 'apply_curse', ['bo'], { mode: 'preview' }).effective).toBe(false);
  });

  it('the chosen Recluse can register as the Demon to a Slayer', () => {
    const s = scene({ ...witch, ed: 'slayer' })
      .start()
      .submit({ ann: ['recluse'], cy: ['fi'] })
      .dawn();
    expect(shootAs(s, 'ann', 'demon').effective).toBe(true);
    expect(s.alive('ann')).toBe(false);
  });

  it('the chosen Moonchild, executed the day after, can still choose', () => {
    const s = scene(witch)
      .start()
      .submit({ ann: ['moonchild'], cy: ['fi'] })
      .dawn()
      .execute('ann');
    s.act('moonchild', 'target', ['di'], { holder: 'ann' });
    s.dusk().dawn();
    expect(s.alive('di')).toBe(false);
  });
});
