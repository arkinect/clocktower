import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ENGINE_VERSION, GameState } from '../../src';

// A saved game from another engine version is archived, never migrated. So a change to the saved shape must bump
// ENGINE_VERSION, and this file records the shape each version shipped with.
const SHAPES: Record<number, string> = {
  1: 'c504111005337482',
};

describe('the saved game shape', () => {
  it('changes only with a new ENGINE_VERSION', () => {
    const shape = JSON.stringify(z.toJSONSchema(GameState, { unrepresentable: 'any' }));
    const hash = createHash('sha256').update(shape).digest('hex').slice(0, 16);
    expect(hash, 'GameState changed: bump ENGINE_VERSION and add its hash here').toBe(SHAPES[ENGINE_VERSION]);
  });
});
