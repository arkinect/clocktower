// Intents are checked against their declared fields before the engine sees them (design.md section 5.5).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Store } from '../src/db';
import { GameManager, type LiveGame } from '../src/manager';
import { INTENT_SHAPES, wellFormedIntent } from '../src/intent-shape';
import { createGame } from '../src/engine/game';
import { validateChoice } from '../src/engine/actions';
import type { ActionSpec } from '@ct/shared';

let dir: string;
let store: Store;
let games: GameManager;
let g: LiveGame;
let admin: string;
let player: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-intent-'));
  store = new Store(dir);
  games = new GameManager(store);
  g = games.ensure('t');
  const a = games.join(g, { name: 'ST', rolePreference: 'none', wantsAdmin: true });
  const p = games.join(g, { name: 'Ada', rolePreference: 'none', wantsAdmin: false });
  if (!a.ok || !p.ok) throw new Error('join failed');
  admin = a.playerId;
  player = p.playerId;
});
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Fields typed `unknown` in protocol.ts accept anything, so they can't be malformed. */
const ANY_VALUE = new Set(['set_setting.value', 'set_day_fact.value']);
const BAD = { bogus: 1 };

describe('intent shapes', () => {
  it('a malformed intent of every type is rejected without changing state', () => {
    let checked = 0;
    for (const [type, fields] of Object.entries(INTENT_SHAPES)) {
      for (const field of Object.keys(fields)) {
        if (ANY_VALUE.has(`${type}.${field}`)) continue;
        const before = g.state;
        const events = store.events(g.state.id).length;
        for (const actor of [admin, player]) {
          const r = games.intent(g, actor, { type, [field]: BAD });
          expect(r, `${type}.${field}`).toEqual({ ok: false, error: 'Bad request.' });
        }
        expect(g.state).toBe(before);
        expect(store.events(g.state.id)).toHaveLength(events);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('rejects a missing field, an unknown player id, an unknown type and a non-object', () => {
    for (const bad of [
      { type: 'rename_player', playerId: player }, // no name
      { type: 'remove_player', playerId: 'p999' },
      { type: 'set_seating', order: [admin, 'p999'] },
      { type: 'submit_night', actions: { imp: { values: [1] } } },
      { type: 'set_type_counts', counts: [1, 2, 3] },
      { type: 'no_such_intent' },
      { type: 'toString' },
      'end_game', null, undefined, 42, [],
    ]) {
      expect(games.intent(g, admin, bad), JSON.stringify(bad)).toEqual({ ok: false, error: 'Bad request.' });
    }
  });

  it('accepts well-formed intents, including optional and null fields', () => {
    const s = createGame('x', 0);
    s.players.push({ id: 'p1' } as never, { id: 'p2' } as never);
    for (const ok of [
      { type: 'end_game' },
      { type: 'begin_night0' },
      { type: 'begin_night0', force: true },
      { type: 'assign_role', playerId: 'p1', roleId: null },
      { type: 'set_red_herring', playerId: null },
      { type: 'set_type_counts', counts: null },
      { type: 'submit_night', actions: { imp: { values: ['p2'] }, poisoner: { decline: true, values: [] } } },
      { type: 'set_day_fact', key: 'notes', value: 'anything' },
      { type: 'day_kill', kind: 'slayer', sourceId: 'p1', targetId: 'p2', mode: 'preview' },
      { type: 'set_godfather_outsiders', value: -1 },
      { type: 'set_cannibal_ability', playerId: 'p1', roleId: null },
      { type: 'set_cannibal_ability', playerId: 'p1', roleId: 'empath' },
    ]) {
      expect(wellFormedIntent(s, ok), JSON.stringify(ok)).toBe(true);
    }
  });

  it('an answer to an \'option\' field is its option id, a string', () => {
    const s = createGame('x', 0);
    s.players.push({ id: 'p1' } as never);
    const spec: ActionSpec = {
      key: 'q:p1', roleId: 'empath', title: 'Question', prompt: 'Live or die?', distinct: true, allowDecline: false,
      fields: [{ kind: 'option', label: 'Answer', options: ['live', 'die'], labels: { live: 'Live', die: 'Die' } }, { kind: 'player', label: 'Player', options: ['p1'] }],
    };
    for (const choice of [{ values: ['live', 'p1'] }, { values: ['die'] }]) {
      expect(wellFormedIntent(s, { type: 'answer_follow_up', key: 'q:p1', choice })).toBe(true);
      expect(wellFormedIntent(s, { type: 'submit_night', actions: { q: choice } })).toBe(true);
    }
    for (const choice of [{ values: [true] }, { values: [{ live: 'Live' }] }, { values: 'live' }, { decline: 'yes', values: [] }]) {
      expect(wellFormedIntent(s, { type: 'answer_follow_up', key: 'q:p1', choice }), JSON.stringify(choice)).toBe(false);
      expect(wellFormedIntent(s, { type: 'submit_night', actions: { q: choice } }), JSON.stringify(choice)).toBe(false);
    }
    // Then the engine checks the meaning: an option id is legal, its label is not; 'distinct' counts players only.
    expect(validateChoice(spec, { values: ['live', 'p1'] })).toBeNull();
    expect(validateChoice(spec, { values: ['Live', 'p1'] })).toMatch(/"Answer" is not a legal choice/);
    expect(validateChoice(spec, { values: ['live'] })).toMatch(/choose 2 option/);
  });
});
