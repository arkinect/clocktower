// Commands are checked against their declared shape before any game rule sees them.
import { describe, expect, it } from 'vitest';
import { Command } from '@ct/protocol';
import type { PlayerId } from '@ct/protocol';
import { dispatch } from '../../src';
import { pid, seated, ST } from '../helpers/game';

const BAD = { bogus: 1 };
const inputs = { now: 5_000, seed: 3 };
const fieldsOf = (schema: (typeof Command.options)[number]) => Object.keys(schema.shape).filter((k) => k !== 'type');
const typeOf = (schema: (typeof Command.options)[number]) => schema.shape.type.value;

describe('command shapes', () => {
  const g = seated(['Ann', 'Bo']);
  const send = (actor: PlayerId, input: unknown) => dispatch(g.state, actor, input, inputs);

  it('a malformed field on every command is refused, for anyone, without touching the game', () => {
    let checked = 0;
    for (const schema of Command.options) {
      for (const field of fieldsOf(schema)) {
        for (const actor of [ST, pid('Ann')]) {
          const res = send(actor, { type: typeOf(schema), [field]: BAD });
          expect(res, `${typeOf(schema)}.${field}`).toEqual({ ok: false, error: 'Bad request.' });
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('refuses a missing field, a wrong type, an unknown command and a non-object', () => {
    for (const bad of [
      { type: 'rename_player', playerId: 'ann' },
      { type: 'submit_night', actions: { imp: { values: [1] } } },
      { type: 'set_type_counts', counts: [1, 2, 3] },
      { type: 'no_such_command' },
      { type: 'toString' },
      { type: 'open_setup', extra: true },
      'end_game',
      null,
      undefined,
      42,
      [],
    ]) {
      expect(send(ST, bad), JSON.stringify(bad)).toEqual({ ok: false, error: 'Bad request.' });
    }
  });

  it('accepts well-formed commands, including optional and null fields', () => {
    for (const ok of [
      { type: 'end_game' },
      { type: 'begin_first_night', force: true },
      { type: 'assign_character', playerId: 'ann', roleId: null },
      { type: 'set_type_counts', counts: null },
      { type: 'submit_night', actions: { imp: { values: ['bo'] }, poisoner: { decline: true, values: [] } } },
      { type: 'day_action', abilityId: 'a1', action: 'shoot', values: ['bo'], mode: 'preview' },
    ]) {
      expect(Command.safeParse(ok).success, JSON.stringify(ok)).toBe(true);
    }
  });

  it('an answer is a list of strings', () => {
    const answer = (choice: unknown) => Command.safeParse({ type: 'answer_question', key: 'q', choice }).success;
    for (const choice of [{ values: ['live', 'bo'] }, { values: ['die'] }]) expect(answer(choice)).toBe(true);
    for (const choice of [
      { values: [true] },
      { values: [{ live: 'Live' }] },
      { values: 'live' },
      { decline: 'yes', values: [] },
    ]) {
      expect(answer(choice), JSON.stringify(choice)).toBe(false);
    }
  });
});
