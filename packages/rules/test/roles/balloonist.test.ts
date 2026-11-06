import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Balloonist', () => {
  it('adds an Outsider at setup', () => {
    const s = scene({ ann: 'balloonist', bo: 't1', cy: 'd1', di: 't2', ed: 'm1' });
    expect(s.g.grimoire().setup.counts.target).toEqual([2, 1, 1, 1]);
  });
  it('shows a new type each night, then nothing', () => {
    const s = scene({ ann: 'balloonist', bo: 't1', cy: 'd1' }).start();
    s.decide('balloonist', 'bo');
    expect(s.truth('ann')).toEqual(['bo']);
    s.nextNight().decide('balloonist', 'cy');
    expect(s.truth('ann')).toEqual(['cy']);
    s.nextNight();
    expect(s.truth('ann')).toEqual(['You learn nothing new.']);
  });
});
