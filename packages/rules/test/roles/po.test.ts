import { describe, expect, it } from 'vitest';
import { as } from '../helpers/scene';
import { scene } from '../scenario';

const cast = { ann: 'po', bo: 't1', cy: 't2', di: 't3', ed: 't4', fi: 'm1' };
describe('Po', () => {
  it('kills one, or no one and then exactly three', () => {
    const s = scene(cast).start().nextNight();
    expect(s.specs('ann')[0]).toMatchObject({ allowDecline: true });
    expect(s.specs('ann')[0]?.fields).toHaveLength(1);
    s.submit({ ann: [] }).nextNight();
    const spec = s.specs('ann')[0];
    expect(spec?.fields).toHaveLength(3);
    expect(spec?.allowDecline).toBeFalsy();
    const send = (choice: { values: string[]; decline?: boolean }) =>
      s.g.tryAs(as('ann'), { type: 'submit_night', actions: { [spec?.key as string]: choice } }).ok;
    expect(send({ decline: true, values: [] })).toBe(false);
    expect(send({ values: ['bo', 'cy'].map(as) })).toBe(false);
    s.submit({ ann: ['bo', 'cy', 'di'] }).dawn();
    expect(s.dead('bo', 'cy', 'di')).toBe(true);
  });
});
