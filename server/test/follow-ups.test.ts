// Follow-up questions during night review (NightRun.askFollowUp), used by the Ravenkeeper.
import { describe, expect, it } from 'vitest';
import { act, build, nextNight, resolve, resultFor, runNight, submit, tryAct, type TestGame } from './helpers';
import { v7 } from '../src/engine/migrations/v7';

/** Night 1 where the Imp kills the Ravenkeeper, who is then asked to choose a player. */
function ravenkeeperDies(): TestGame & { key: string } {
  const g = build(['ravenkeeper', 'imp', 'empath', 'butler', 'poisoner', 'sailor']);
  runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
  nextNight(g);
  submit(g, { [g.p.imp]: { imp: [g.p.ravenkeeper] } });
  resolve(g);
  return Object.assign(g, { key: `ravenkeeper:${g.p.ravenkeeper}` });
}

const open = (g: TestGame) => g.s.night!.resolution!.followUps.filter((f) => !f.answered).map((f) => f.key);

describe('follow-up questions', () => {
  it('records the question with its key and spec, and extends the night once', () => {
    const g = ravenkeeperDies();
    const [q] = g.s.night!.resolution!.followUps;
    expect(q).toMatchObject({ key: g.key, playerId: g.p.ravenkeeper, roleId: 'ravenkeeper', answered: false });
    expect(q.spec.key).toBe(g.key);
    expect(g.s.nightEndsAt).not.toBeNull();
  });

  it('"Accept all defaults" leaves a question unanswered', () => {
    const g = ravenkeeperDies();
    act(g, { type: 'accept_all_defaults' });
    expect(open(g)).toEqual([g.key]);
    expect(tryAct(g, { type: 'publish_night' }).ok).toBe(false);
  });

  it('re-opening collecting clears the answers', () => {
    const g = ravenkeeperDies();
    act(g, { type: 'answer_follow_up', key: g.key, choice: { values: [g.p.poisoner] } }, g.p.ravenkeeper);
    expect(open(g)).toEqual([]);
    act(g, { type: 'reopen_collecting' });
    expect(g.s.night!.followUpAnswers).toEqual({});
    act(g, { type: 'resolve_night', force: true });
    expect(open(g)).toEqual([g.key]);
  });

  it('the Storyteller can answer for the player', () => {
    const g = ravenkeeperDies();
    act(g, { type: 'answer_follow_up_for', key: g.key, choice: { values: [g.p.imp] } });
    expect(g.s.night!.followUpAnswers[g.key]).toMatchObject({ byAdmin: true, choice: { values: [g.p.imp] } });
    expect(resultFor(g.s.night!.resolution!, g.p.ravenkeeper)!.trueLines[0]).toMatch(/Imp/);
  });

  it('only the asked player can answer, once, with a legal choice', () => {
    const g = ravenkeeperDies();
    expect(tryAct(g, { type: 'answer_follow_up', key: g.key, choice: { values: [g.p.imp] } }, g.p.empath).ok).toBe(false);
    expect(tryAct(g, { type: 'answer_follow_up', key: g.key, choice: { values: ['nobody'] } }, g.p.ravenkeeper).ok).toBe(false);
    expect(tryAct(g, { type: 'answer_follow_up', key: 'no-such-question', choice: { values: [g.p.imp] } }, g.p.ravenkeeper).ok).toBe(false);
    act(g, { type: 'answer_follow_up', key: g.key, choice: { values: [g.p.imp] } }, g.p.ravenkeeper);
    expect(tryAct(g, { type: 'answer_follow_up', key: g.key, choice: { values: [g.p.empath] } }, g.p.ravenkeeper).ok).toBe(false);
  });

  it('the v7 step drops the night and renames the time setting', () => {
    const s: Record<string, unknown> = { night: { ravenSubmissions: {} }, settings: { countdownSeconds: 300, ravenkeeperExtensionSeconds: 90 } };
    v7(s);
    expect(s).toEqual({ night: null, settings: { countdownSeconds: 300, followUpExtensionSeconds: 90 } });
  });
});
