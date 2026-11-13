import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'flowergirl', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' };
describe('Flowergirl', () => {
  it('learns whether a Demon voted, as recorded today', () => {
    const s = scene(cast).start().dawn();
    s.act('flowergirl', 'demon_voted', ['yes']);
    s.dusk();
    expect(s.truth('ann')).toEqual(['Yes, a Demon voted today.']);
  });
  it('defaults to no', () => {
    const s = scene(cast).start().nextNight();
    expect(s.truth('ann')).toEqual(['No, a Demon did not vote today.']);
  });
  it('shows the answer recorded today, and needs one tonight', () => {
    const s = scene(cast).start().dawn();
    const fact = () => s.dayActions().find((d) => d.roleId === 'flowergirl');
    expect(fact()).toMatchObject({ recorded: null, neededTonight: true, preview: false });
    s.act('flowergirl', 'demon_voted', ['no']);
    expect(fact()?.recorded).toEqual(['no']);
    s.dusk().review();
    expect(s.hasDecision('flowergirl_voted')).toBe(false);
  });
  it('shows "No" by default, which dusk records, so Review does not ask', () => {
    const s = scene(cast).start().dawn();
    expect(s.dayActions().find((d) => d.roleId === 'flowergirl')).toMatchObject({ default: ['no'], recorded: null });
    s.dusk().review();
    expect(s.hasDecision('flowergirl_voted')).toBe(false);
    expect(s.truth('ann')).toEqual(['No, a Demon did not vote today.']);
  });
  it('a Philosopher who chooses it tonight had no day to record it: Review asks before dawn can be published', () => {
    const s = scene({ ...cast, ann: 'philosopher' })
      .start()
      .dawn();
    expect(s.dayActions().filter((d) => d.roleId === 'flowergirl')).toEqual([]);
    s.dusk().submit({ ann: ['flowergirl'] });
    s.review();
    const d = s.decision('flowergirl_voted');
    expect(d).toMatchObject({ required: true, chosen: null, title: 'Flowergirl: did a Demon vote on Day 1?' });
    s.g.st({ type: 'accept_all_defaults' });
    expect(s.decision('flowergirl_voted').chosen).toBeNull();
    expect(s.g.rejected('st' as never, { type: 'publish_dawn', force: false })).toBe(
      'Waiting for a decision: Flowergirl: did a Demon vote on Day 1? Answer it or force.',
    );
    s.decide('flowergirl_voted', 'yes');
    expect(s.truth('ann')).toContain('Yes, a Demon voted today.');
    s.g.st({ type: 'publish_dawn', force: false });
    expect(s.state.phase.kind).toBe('day');
  });
  it('publish anyway goes through without the answer', () => {
    const s = scene(cast).start().dawn().dusk().review();
    s.g.st({ type: 'publish_dawn', force: true });
    expect(s.state.phase.kind).toBe('day');
  });
  it('does not act on Night 0', () => {
    expect(scene(cast).start().truth('ann')).toEqual([]);
  });
});
