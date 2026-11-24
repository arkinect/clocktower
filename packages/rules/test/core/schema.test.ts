import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ENGINE_VERSION, GameState } from '../../src';

// A saved game from another engine version is archived, never migrated. So a change to the saved shape must bump
// ENGINE_VERSION, and this file records the shape each version shipped with.
const SHAPES: Record<number, string> = {
  1: 'c504111005337482',
  2: '249a23b56f34e5f8',
  3: '9c34db79e1e4149d',
  4: '0695a7f97aae90e0',
  5: 'a8498de2359bc4f0',
  6: '7ca22f143d47c5ea',
};

describe('the saved game shape', () => {
  it('changes only with a new ENGINE_VERSION', () => {
    const shape = JSON.stringify(z.toJSONSchema(GameState, { unrepresentable: 'any', io: 'input' }));
    const hash = createHash('sha256').update(shape).digest('hex').slice(0, 16);
    expect(hash, 'GameState changed: bump ENGINE_VERSION and add its hash here').toBe(SHAPES[ENGINE_VERSION]);
  });
});
