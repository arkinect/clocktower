// Follow-up questions: who is asked, who may answer, and what clears an answer.
import { describe, expect, it } from 'vitest';
import { as, open } from '../helpers/scene';
import { scene, ST } from '../scenario';
import { pid } from '../helpers/game';

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
    expect(s.res.questions[0]).toMatchObject({ playerId: pid('ann'), roleId: 'ravenkeeper', answered: false });
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
    s.g.st({ type: 'answer_question_for', key: s.res.questions[0]?.key as string, choice: { values: [pid('bo')] } });
    expect(s.truth('ann')[0]).toMatch(/Imp/);
  });

  it('only the asked player can answer, once, with a legal choice', () => {
    const s = dying();
    const key = s.res.questions[0]?.key as string;
    const send = (id: string, k: string, v: string) =>
      s.g.tryAs(as(id), { type: 'answer_question', key: k, choice: { values: [s.value(v)] } }).ok;
    expect(send('cy', key, 'bo')).toBe(false);
    expect(send('ann', key, 'nobody')).toBe(false);
    expect(send('ann', 'no-such-question', 'bo')).toBe(false);
    expect(send('ann', key, 'bo')).toBe(true);
    expect(send('ann', key, 'cy')).toBe(false);
  });
});
