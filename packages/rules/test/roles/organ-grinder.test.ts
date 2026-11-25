import { describe, expect, it } from 'vitest';
import { as } from '../helpers/scene';
import { pid } from '../helpers/game';
import { scene, type Scene } from '../scenario';

const cast = { ann: 'organ_grinder', bo: 'poisoner', cy: 'imp', di: 'empath', ed: 'butler' };
const eyes = (s: Scene) => s.g.grimoire().dayNotices.some((n) => n.includes('Eyes-closed'));
const outcome = (s: Scene) => s.res.actors.find((a) => a.playerId === pid('ann'))?.outcome;

describe('Organ Grinder', () => {
  it('wakes every night with a Drunk or Sober choice and no decline', () => {
    const s = scene(cast).start();
    const [spec] = s.specs('ann');
    expect(spec?.allowDecline).toBeFalsy();
    expect(spec?.fields[0]).toMatchObject({
      kind: 'option',
      options: ['drunk', 'sober'],
      labels: { drunk: 'Drunk until dusk', sober: 'Stay sober' },
    });
    const key = spec?.key as string;
    const send = (choice: { values: string[]; decline?: boolean }) =>
      s.g.tryAs(as('ann'), { type: 'submit_night', actions: { [key]: choice } }).ok;
    expect(send({ values: ['maybe'] })).toBe(false);
    expect(send({ decline: true, values: [] })).toBe(false);
    s.nextNight();
    expect(s.specs('ann').map((x) => x.roleId)).toEqual(['organ_grinder']);
  });

  it('eyes-closed voting while sober and alive; no submission counts as sober, and the row says so', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['sober'] })
      .review();
    expect(outcome(s)).toBe('stays sober');
    s.dawn();
    expect(eyes(s)).toBe(true);
    s.dusk().review();
    expect(outcome(s)).toBe('no choice: stays sober');
    s.dawn();
    expect(eyes(s)).toBe(true);
    s.kill('ann');
    expect(eyes(s)).toBe(false);
  });

  it('can choose to be drunk until dusk', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['drunk'] })
      .dawn();
    expect(s.impaired('ann')).toBe(true);
    expect(s.g.grimoire().dayNotices).toEqual([]);
    s.dusk();
    expect(s.impaired('ann')).toBe(false);
  });

  it('poisoned: no eyes-closed voting, and choosing drunk does nothing', () => {
    const s = scene(cast)
      .start()
      .submit({ bo: ['ann'], ann: ['drunk'] })
      .dawn();
    expect(eyes(s)).toBe(false);
    expect(s.state.conditions.filter((c) => c.type === 'drunk')).toEqual([]);
  });
});
