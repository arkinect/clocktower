import { expect } from 'vitest';
import type { PlayerId, RoleId } from '@ct/protocol';
import { findRole, playerView, storytellerView, type GameStateT } from '../../src';
import { ST, type TestGame } from './game';

const HIDDEN_KEYS = new Set(['alignment', 'character', 'abilities', 'conditions', 'causes', 'impaired', 'bag', 'log']);

/** Walks a value and reports any key only the Storyteller may see. */
function hiddenKeys(value: unknown, path = 'view'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => hiddenKeys(v, `${path}[${i}]`));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(HIDDEN_KEYS.has(k) ? [`${path}.${k}`] : []),
    ...hiddenKeys(v, `${path}.${k}`),
  ]);
}

/**
 * A player's view must not move when another player's hidden facts do. Rewriting everyone else's character and
 * alignment and dropping their inboxes must leave the projection unchanged.
 */
export function assertHidden(g: TestGame) {
  const s = g.state;
  for (const id of Object.keys(s.players) as PlayerId[]) {
    if (id === s.storytellerId) continue;
    const view = playerView(s, id, g.now);
    expect(hiddenKeys(view)).toEqual([]);
    const blanked: GameStateT = {
      ...s,
      players: Object.fromEntries(
        Object.entries(s.players).map(([k, p]) => [
          k,
          k === id || p.character === null || isPublic(p.character)
            ? p
            : { ...p, character: null, alignment: 'good', self: { character: null, alignment: 'good' } },
        ]),
      ),
      inbox: { [id]: s.inbox[id] ?? [] },
    };
    if (s.phase.kind === 'night' && s.phase.stage === 'collecting') continue; // pickers read the real world
    if (s.phase.kind === 'night' && s.phase.stage === 'review') continue; // follow-up questions likewise
    expect(playerView(blanked, id, g.now)).toEqual(view);
  }
  const grim = JSON.stringify(storytellerView(s, ST, { now: g.now }));
  expect(grim).not.toContain('sessionToken');
}

const isPublic = (role: RoleId) => findRole(role)?.type === 'traveller';
