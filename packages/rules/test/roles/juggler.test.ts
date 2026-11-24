import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'juggler', bo: 't1', cy: 'd1', di: 't2', ed: 't3' };
/** Day 1, with the Storyteller's answer to whether they guessed publicly, then night 1's collecting. */
const night1 = (juggled: 'yes' | 'no' | null) => {
  const s = scene(cast).start().dawn();
  if (juggled) s.act('juggler', 'juggled', [juggled]);
  return s.dusk();
};
const submitFor = (s: ReturnType<typeof scene>, values: string[]) => {
  const spec = s.specs('ann')[0];
  if (!spec) throw new Error('ann has no picker');
  return s.g.rejected(pid('st'), {
    type: 'submit_for',
    playerId: pid('ann') as never,
    actions: { [spec.key]: { values: values.map(s.value) } },
  });
};

describe('Juggler', () => {
  it('the Day tab asks only whether they guessed publicly, off until changed', () => {
    const s = scene(cast).start().dawn();
    const row = () => s.dayActions().find((d) => d.roleId === 'juggler');
    expect(row()).toMatchObject({ control: 'toggle', recorded: null, default: ['no'], neededTonight: false });
    s.act('juggler', 'juggled', ['yes']);
    expect(row()?.recorded).toEqual(['yes']);
    s.act('juggler', 'juggled', ['no']);
    expect(row()?.recorded).toEqual(['no']);
  });

  it('enters their own guesses that night, and learns how many were right', () => {
    const s = night1('yes');
    const spec = s.specs('ann')[0];
    expect(spec).toMatchObject({ roleId: 'juggler', maxRows: 5, distinct: true });
    expect(spec?.fields.map((f) => f.kind)).toEqual(['player', 'role']);
    s.submit({ ann: ['bo', 't1', 'cy', 'd1', 'di', 't2', 'ed', 't1'] });
    expect(s.truth('ann')).toEqual(['You guessed 3 correctly.']);
  });

  describe('a guess is right or wrong when it is made', () => {
    const imps = { ann: 'juggler', bo: 'imp', cy: 'scarlet_woman', di: 't1', ed: 't2', fi: 't3', gu: 't4' };
    const day1 = () => {
      const s = scene(imps).start().dawn();
      s.act('juggler', 'juggled', ['yes']);
      return s;
    };
    const guesses = ['bo', 'imp', 'cy', 'scarlet_woman', 'di', 't2'];

    it('a Minion who becomes the Imp that night was still the Minion', () => {
      const s = day1()
        .dusk()
        .submit({ bo: ['bo'], ann: guesses })
        .review();
      expect(s.truth('ann')).toEqual(['You guessed 2 correctly.']);
      s.dawn();
      expect(s.character('cy')).toBe('imp');
    });

    it('so was a Scarlet Woman who took over at dusk', () => {
      const s = day1().execute('bo').dusk();
      expect(s.character('cy')).toBe('imp');
      s.submit({ ann: guesses }).review();
      expect(s.truth('ann')).toEqual(['You guessed 2 correctly.']);
    });

    it('guessing the Minion as the Imp was wrong', () => {
      const s = day1()
        .dusk()
        .submit({ bo: ['bo'], ann: ['cy', 'imp'] })
        .review();
      expect(s.truth('ann')).toEqual(['You guessed 0 correctly.']);
    });
  });

  it('is waited for when they guessed publicly', () => {
    const s = night1('yes');
    expect(s.g.grimoire().board?.find((r) => r.playerId === pid('ann'))?.expected).toBe(true);
  });

  it('did not guess publicly: no picker, not woken, nothing learned', () => {
    for (const s of [night1('no'), night1(null)]) {
      expect(s.specs('ann')).toEqual([]);
      expect(s.truth('ann')).toEqual([]);
    }
  });

  it('must enter 1 to 5 whole guesses, each about a different player', () => {
    const s = night1('yes');
    expect(submitFor(s, [])).toMatch(/at least one row/);
    expect(submitFor(s, ['bo'])).toMatch(/every part/);
    expect(submitFor(s, Array.from({ length: 6 }, () => ['bo', 'empath']).flat())).toMatch(/at most 5/);
    expect(submitFor(s, ['bo', 'empath', 'bo', 'imp'])).toMatch(/different players/);
    expect(submitFor(s, ['empath', 'bo'])).toMatch(/not a legal choice/);
    s.submit({ ann: ['bo', 'empath'] });
    expect(s.truth('ann')).toEqual(['You guessed 0 correctly.']);
  });

  it('only that night', () => {
    const s = night1('yes').submit({ ann: ['bo', 't1'] });
    s.nextNight();
    expect(s.specs('ann')).toEqual([]);
    expect(s.truth('ann')).toEqual([]);
  });
});
