// Effect durations (design.md section 5.8): an effect with a duration outlasts its source; the Pukka's poison doesn't.
import { describe, expect, it } from 'vitest';
import { computeImpairment } from '../src/engine/impairment';
import { act, alive, build, nextNight, resolve, runNight, submit } from './helpers';
import type { TestGame } from './helpers';

const impaired = (g: TestGame, pid: string) => !!computeImpairment(g.s, Math.max(0, g.s.nightNumber))[pid]?.impaired;
const pukkaPoison = (effects: TestGame['s']['effects']) => effects.filter((e) => e.cause === 'pukka').map((e) => e.targetPlayerId);

describe('the Pukka\'s poison', () => {
  const ROLES = ['pukka', 'scarlet_woman', 'empath', 'butler', 'virgin', 'oracle', 'flowergirl'];

  function poisonedEmpath() {
    const g = build(ROLES);
    runNight(g, { [g.p.pukka]: { pukka: [g.p.empath] } });
    return g;
  }

  it('Pukka executed: the poison ends at the Pukka\'s slot that night and the target does not die', () => {
    const g = poisonedEmpath();
    act(g, { type: 'record_execution', playerId: g.p.pukka, died: true });
    act(g, { type: 'resolve_day_prompt', id: g.s.dayPrompts[0].id, accept: false });
    expect(impaired(g, g.p.empath)).toBe(true); // a duration: it outlasts the Pukka for the rest of the day
    nextNight(g);
    const res = resolve(g);
    expect(res.deaths).toEqual([]);
    expect(pukkaPoison(res.after.effects)).toEqual([]);
  });

  it('the Scarlet Woman becomes the Pukka: her first choice doesn\'t kill the old victim', () => {
    const g = poisonedEmpath();
    act(g, { type: 'record_execution', playerId: g.p.pukka, died: true });
    act(g, { type: 'resolve_day_prompt', id: g.s.dayPrompts[0].id, accept: true });
    nextNight(g);
    submit(g, { [g.p.scarlet_woman]: { pukka: [g.p.butler] } });
    const res = resolve(g);
    expect(res.deaths).toEqual([]);
    expect(pukkaPoison(res.after.effects)).toEqual([g.p.butler]);
    act(g, { type: 'publish_night' });
    expect(alive(g, g.p.empath)).toBe(true);
    expect(impaired(g, g.p.empath)).toBe(false);
    expect(impaired(g, g.p.butler)).toBe(true);
  });

  it('a living Pukka still kills the previous target', () => {
    const g = poisonedEmpath();
    nextNight(g);
    submit(g, { [g.p.pukka]: { pukka: [g.p.butler] } });
    const res = resolve(g);
    expect(res.deaths).toEqual([g.p.empath]);
    expect(pukkaPoison(res.after.effects)).toEqual([g.p.butler]);
  });
});

describe('effects with a duration', () => {
  it('a Sailor who becomes the Farmer that night keeps their drunk target drunk until dusk', () => {
    const g = build(['sailor', 'imp', 'poisoner', 'farmer', 'butler', 'virgin', 'empath']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    const { final } = runNight(g, { [g.p.sailor]: { sailor: [g.p.butler] }, [g.p.imp]: { imp: [g.p.farmer] } }, {
      [`sailor:${g.p.sailor}`]: g.p.butler, [`farmer:${g.p.farmer}`]: g.p.sailor,
    });
    expect(final.after.assignments[g.p.sailor].roleId).toBe('farmer');
    expect(impaired(g, g.p.butler)).toBe(true);
    nextNight(g);
    expect(impaired(g, g.p.butler)).toBe(false);
  });
});
