import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Baron', () => {
  it('adds two Outsiders', () => {
    const s = scene({ ann: 'baron', bo: 't1', cy: 'd1', di: 't2', ed: 't3', fi: 't4', gu: 't5' });
    expect(s.g.grimoire().setup.counts.target).toEqual([3, 2, 1, 1]);
  });
});
