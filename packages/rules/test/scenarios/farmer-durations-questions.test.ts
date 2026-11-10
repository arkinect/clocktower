// The Farmer, effects with a duration, and follow-up questions.
import { describe, expect, it } from 'vitest';
import { roleId } from '@ct/protocol';
import { as, open, titles } from './lib';
import { scene, ST, type Scene } from '../scenario';

const cast = { ann: 'farmer', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'sailor', fi: 'butler' };
const night1 = (chars: Record<string, string> = cast, o?: Parameters<typeof scene>[1]) =>
  scene(chars, o).start().nextNight();
const farmers = (s: Scene) => Object.values(s.state.players).filter((p) => p.character === 'farmer');
/** Only play can make a second Farmer, so a test that needs one writes it in. */
const alsoFarmer = (s: Scene, ...ids: string[]) => {
  const players = { ...s.state.players };
  for (const id of ids) players[as(id)] = { ...s.g.player(as(id)), character: roleId('farmer') };
  s.g.state = { ...s.state, players };
};
const farmerRow = (s: Scene) => s.res.actors.find((a) => a.roleId === 'farmer');

describe('the Farmer', () => {
  it('dies at night: the Storyteller picks an alive good player or nobody, who stays good and is told', () => {
    const s = night1();
    expect(s.specs('ann')).toEqual([]);
    s.submit({ bo: ['ann'] }).review();
    expect(s.res.deaths).toEqual(['ann']);
    const pick = s.decision('farmer');
    expect(pick.options.map((o) => o.id)).toEqual(['di', 'ed', 'fi', 'nobody']);
    expect(['di', 'ed', 'fi']).toContain(pick.default);
    s.decide('farmer', 'fi').dawn();
    expect(s.character('fi')).toBe('farmer');
    expect(s.alignment('fi')).toBe('good');
    expect(titles(s, 'fi')).toContain('You are now the Farmer');
    expect(s.inbox('fi')).toContain('When you die at night, an alive good player becomes a Farmer.');
  });

  it('the new Farmer does not act again tonight as their old role', () => {
    const s = night1()
      .submit({ bo: ['ann'], fi: ['di'] })
      .decide('farmer', 'fi');
    expect(s.res.actors.some((a) => a.playerId === 'fi' && a.roleId === 'butler')).toBe(false);
  });

  it('with only Farmers left among the good, the default is nobody', () => {
    const s = night1({ ann: 'farmer', bo: 'imp', cy: 'poisoner', di: 't1', ed: 't2' });
    alsoFarmer(s, 'di', 'ed');
    s.submit({ bo: ['ann'] }).review();
    expect(s.decision('farmer').default).toBe('nobody');
  });

  it('the default is never a player who is already a Farmer', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = scene({ ann: 'farmer', bo: 'imp', cy: 'poisoner', di: 'empath', ed: 't1' }).start().dawn();
      alsoFarmer(s, 'ed');
      s.g.seed = seed * 13;
      s.dusk();
      s.submit({ bo: ['ann'] }).review();
      expect(s.decision('farmer').default).toBe('di');
    }
  });

  it('Nobody: no character changes and no notice goes out', () => {
    const s = night1()
      .submit({ bo: ['ann'] })
      .decide('farmer', 'nobody');
    expect(s.res.notices).toEqual([]);
    s.dawn();
    expect(farmers(s)).toHaveLength(1);
  });

  it('a Farmer who dies by day does nothing', () => {
    const s = scene(cast).start().dawn().execute('ann').dusk().review();
    expect(s.hasDecision('farmer')).toBe(false);
    expect(farmerRow(s)).toBeUndefined();
  });

  it('a Farmer poisoned when they die does nothing, and it counts as a malfunction', () => {
    const s = night1()
      .submit({ bo: ['ann'], cy: ['ann'] })
      .review();
    expect(s.hasDecision('farmer')).toBe(false);
    expect(farmerRow(s)?.impaired).toBe(true);
    expect(farmerRow(s)?.outcome).toContain('drunk or poisoned when they died: nobody becomes a Farmer');
    expect(s.res.malfunctions).toContainEqual(
      expect.objectContaining({ playerId: 'ann', detail: 'Farmer ability impaired' }),
    );
  });

  it('a Drunk who thinks they are the Farmer does nothing when they die at night', () => {
    const s = night1({ ...cast, ann: 'drunk' }, { believed: { ann: 'farmer' } })
      .submit({ bo: ['ann'] })
      .review();
    expect(s.hasDecision('farmer')).toBe(false);
    expect(farmerRow(s)?.outcome).toContain('not really the Farmer: nobody becomes a Farmer');
    expect(farmers(s)).toEqual([]);
  });

  describe('dying after the Farmer slot', () => {
    const moon = (rest: Record<string, string>, target: string, o?: Parameters<typeof scene>[1]) => {
      // Executed on day 1, the Moonchild learns it on day 2 and chooses then.
      const s = scene({ ann: 'moonchild', bo: 'imp', cy: 'poisoner', ...rest }, o)
        .start()
        .dawn()
        .execute('ann')
        .dusk()
        .dawn();
      s.act('moonchild', 'target', [target]);
      return s.dusk();
    };
    const rest = { di: 'farmer', ed: 'empath', fi: 'sailor' };

    it('the Moonchild kills the Farmer: the same decision, once the night order has finished', () => {
      const s = moon(rest, 'di').review();
      expect(s.res.deaths).toEqual(['di']);
      const pick = s.decision('farmer');
      expect(pick.options.map((o) => o.id)).toEqual(['ed', 'fi', 'nobody']);
      expect(['ed', 'fi']).toContain(pick.default);
      const rows = s.res.actors.filter((a) => a.roleId === 'farmer');
      expect(rows).toHaveLength(1);
      expect(s.res.actors.at(-1)).toEqual(rows[0]);
      s.decide('farmer', 'fi').dawn();
      expect(s.character('fi')).toBe('farmer');
      expect(titles(s, 'fi')).toContain('You are now the Farmer');
    });

    it('a Farmer poisoned when the Moonchild kills them does nothing, with the same note', () => {
      const s = moon(rest, 'di')
        .submit({ cy: ['di'] })
        .review();
      expect(s.hasDecision('farmer')).toBe(false);
      expect(farmerRow(s)?.outcome).toContain('drunk or poisoned when they died: nobody becomes a Farmer');
    });

    it('a new Farmer killed later the same night also passes it on', () => {
      const s = moon(rest, 'ed')
        .submit({ bo: ['di'] })
        .decide('farmer', 'ed');
      const next = s.res.decisions.find((d) => d.key.kind === 'farmer' && d.key.subject !== 'di');
      expect(next).toBeDefined();
      s.g.st({ type: 'decide', key: next?.key as never, option: 'fi' });
      expect(s.res.deaths).toEqual(['di', 'ed']);
      s.dawn();
      expect(s.character('fi')).toBe('farmer');
    });

    it('a Drunk who thinks they are the Farmer gets nothing after the order', () => {
      const s = moon({ di: 'drunk', ed: 'empath', fi: 'sailor' }, 'di', { believed: { di: 'farmer' } }).review();
      expect(s.res.deaths).toEqual(['di']);
      expect(s.hasDecision('farmer')).toBe(false);
    });
  });
});

describe('the Pukka poison', () => {
  const pukka = {
    ann: 'pukka',
    bo: 'scarlet_woman',
    cy: 'empath',
    di: 'butler',
    ed: 'virgin',
    fi: 'oracle',
    gus: 'flowergirl',
  };
  const poisoned = () =>
    scene(pukka)
      .start()
      .submit({ ann: ['cy'] })
      .dawn();

  it('Pukka executed: the poison outlasts the day, ends at their slot, and the target does not die', () => {
    // The Scarlet Woman is poisoned at dusk, so she doesn't take over.
    const s = poisoned().execute('ann');
    s.g.st({ type: 'add_condition', target: 'bo' as never, condition: 'poisoned' });
    expect(s.impaired('cy')).toBe(true);
    s.dusk().review();
    expect(s.res.deaths).toEqual([]);
    s.dawn();
    expect(s.impaired('cy')).toBe(false);
  });

  it('the Scarlet Woman becomes the Pukka: her first choice does not kill the old victim', () => {
    const s = poisoned()
      .execute('ann')
      .dusk()
      .submit({ bo: ['di'] })
      .review();
    expect(s.res.deaths).toEqual([]);
    s.dawn();
    expect(s.alive('cy')).toBe(true);
    expect(s.impaired('cy')).toBe(false);
    expect(s.impaired('di')).toBe(true);
  });

  it('a living Pukka still kills the previous target', () => {
    const s = poisoned()
      .dusk()
      .submit({ ann: ['di'] })
      .review();
    expect(s.res.deaths).toEqual(['cy']);
    s.dawn();
    expect(s.impaired('di')).toBe(true);
  });
});

describe('effects with a duration', () => {
  const heirs = { ann: 'sailor', bo: 'imp', cy: 'poisoner', di: 'farmer', ed: 'butler', fi: 'virgin', gus: 'empath' };

  it('a Sailor who becomes the Farmer that night keeps their drunk target drunk until dusk', () => {
    const s = scene(heirs)
      .start()
      .submit({ ann: ['ann'] })
      .nextNight();
    s.submit({ ann: ['ed'], bo: ['di'] })
      .decide('sailor', 'ed')
      .decide('farmer', 'ann')
      .dawn();
    expect(s.character('ann')).toBe('farmer');
    expect(s.impaired('ed')).toBe(true);
    s.dusk();
    expect(s.impaired('ed')).toBe(false);
  });

  it('a poisoned Cannibal who becomes the Farmer is no longer poisoned', () => {
    const s = scene({ ...heirs, ann: 'cannibal' })
      .start()
      .dawn()
      .execute('cy')
      .dusk();
    expect(s.impaired('ann')).toBe(true);
    s.submit({ bo: ['di'] })
      .decide('farmer', 'ann')
      .dawn();
    expect(s.character('ann')).toBe('farmer');
    expect(s.impaired('ann')).toBe(false);
  });
});

describe('follow-up questions', () => {
  const dying = () =>
    scene({ ann: 'ravenkeeper', bo: 'imp', cy: 'empath', di: 'butler', ed: 'poisoner', fi: 'sailor' })
      .start()
      .submit({ fi: ['fi'] })
      .nextNight()
      .submit({ bo: ['ann'] })
      .review();

  it('records the question and keeps the deadline', () => {
    const s = dying();
    expect(s.res.questions[0]).toMatchObject({ playerId: 'ann', roleId: 'ravenkeeper', answered: false });
    expect(s.night.deadline).not.toBeNull();
  });

  it('"Accept all defaults" leaves a question unanswered', () => {
    const s = dying();
    s.g.st({ type: 'accept_all_defaults' });
    expect(open(s)).toHaveLength(1);
    expect(s.g.tryAs(ST, { type: 'publish_dawn', force: false }).ok).toBe(false);
  });

  it('reopening collecting clears the answers', () => {
    const s = dying().answer('ann', ['ed']);
    expect(open(s)).toEqual([]);
    s.g.st({ type: 'reopen_collecting' });
    s.review();
    expect(open(s)).toHaveLength(1);
  });

  it('the Storyteller can answer for the player', () => {
    const s = dying();
    s.g.st({ type: 'answer_question_for', key: s.res.questions[0]?.key as string, choice: { values: ['bo'] } });
    expect(s.truth('ann')[0]).toMatch(/Imp/);
  });

  it('only the asked player can answer, once, with a legal choice', () => {
    const s = dying();
    const key = s.res.questions[0]?.key as string;
    const send = (id: string, k: string, v: string) =>
      s.g.tryAs(as(id), { type: 'answer_question', key: k, choice: { values: [v] } }).ok;
    expect(send('cy', key, 'bo')).toBe(false);
    expect(send('ann', key, 'nobody')).toBe(false);
    expect(send('ann', 'no-such-question', 'bo')).toBe(false);
    expect(send('ann', key, 'bo')).toBe(true);
    expect(send('ann', key, 'cy')).toBe(false);
  });
});
