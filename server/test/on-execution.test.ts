// The onExecution role hook (server/src/engine/roles/index.ts): run after an execution kills, for each real ability.
import { afterEach, describe, expect, it } from 'vitest';
import { act, build, runNight } from './helpers';
import { BEHAVIOURS, type ExecutionCtx } from '../src/engine/roles';

const calls: Omit<ExecutionCtx, 's'>[] = [];
const original = BEHAVIOURS.empath;
afterEach(() => { BEHAVIOURS.empath = original; calls.length = 0; });

/** A day with the hook registered on the Empath only, in this test. A Drunk believes they are the Empath. */
function day() {
  BEHAVIOURS.empath = { ...original, onExecution: ({ s: _s, ...rest }) => { calls.push(rest); } };
  const g = build(['empath', 'imp', 'scarlet_woman', 'clockmaker', 'drunk']);
  g.s.assignments[g.p.drunk].believedRoleId = 'empath';
  runNight(g, {});
  return g;
}

describe('onExecution hook', () => {
  it('runs once per holder with the real ability when an execution kills', () => {
    const g = day();
    act(g, { type: 'record_execution', playerId: g.p.clockmaker, died: true }, g.admin, 1);
    expect(calls).toEqual([{ executeeId: g.p.clockmaker, holderId: g.p.empath, now: expect.any(Number) }]);
  });

  it('runs for a holder who is the executee', () => {
    const g = day();
    act(g, { type: 'record_execution', playerId: g.p.empath, died: true });
    expect(calls.map((c) => c.holderId)).toEqual([g.p.empath]);
  });

  it('does not run when nobody died, nobody was executed, or the executee was already dead', () => {
    const g = day();
    act(g, { type: 'record_execution', playerId: g.p.clockmaker, died: false });
    act(g, { type: 'record_execution', playerId: null, died: false });
    act(g, { type: 'mark_alive', playerId: g.p.scarlet_woman, alive: false });
    act(g, { type: 'record_execution', playerId: g.p.scarlet_woman, died: true });
    expect(calls).toEqual([]);
  });
});
