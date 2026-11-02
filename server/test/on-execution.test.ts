// The onExecution role hook (server/src/engine/roles/index.ts): run after an execution kills, for each real ability.
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
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
    expect(calls).toEqual([{ executeeId: g.p.clockmaker, holderId: g.p.empath, now: expect.any(Number), real: true }]);
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

describe('onExecution for believed holders (onExecutionBelieved)', () => {
  const seen: { holderId: string; real: boolean }[] = [];
  afterEach(() => { seen.length = 0; });

  function optedIn() {
    const g = day();
    BEHAVIOURS.empath = { ...original, onExecutionBelieved: true, onExecution: (ctx) => { seen.push({ holderId: ctx.holderId, real: ctx.real }); } };
    return g;
  }

  it('a real holder\'s call says real: true', () => {
    const g = day();
    BEHAVIOURS.empath = { ...original, onExecution: (ctx) => { seen.push({ holderId: ctx.holderId, real: ctx.real }); } };
    act(g, { type: 'record_execution', playerId: g.p.clockmaker, died: true });
    expect(seen).toEqual([{ holderId: g.p.empath, real: true }]);
  });

  it('a role that opts in also runs for a player who only believes they have it, with real: false', () => {
    const g = optedIn();
    act(g, { type: 'record_execution', playerId: g.p.clockmaker, died: true });
    expect(seen).toEqual([{ holderId: g.p.empath, real: true }, { holderId: g.p.drunk, real: false }]);
  });

  it('opting in changes nothing when no execution kills', () => {
    const g = optedIn();
    act(g, { type: 'record_execution', playerId: g.p.clockmaker, died: false });
    expect(seen).toEqual([]);
  });

  it('an ability eaten from an evil executee is a believed one: only an opted-in role runs for it', () => {
    const g = day();
    // The Cannibal's own eating (cannibal.test.ts) is switched off here, so the planted eaten ability stays.
    const cannibal = BEHAVIOURS.cannibal;
    BEHAVIOURS.cannibal = {};
    onTestFinished(() => { BEHAVIOURS.cannibal = cannibal; });
    g.s.assignments[g.p.drunk].believedRoleId = 'clockmaker';
    g.s.assignments[g.p.clockmaker].roleId = 'cannibal';
    g.s.assignments[g.p.clockmaker].eatenAbility = { roleId: 'empath', fromNight: 0, executeeId: g.p.imp, fake: true };
    BEHAVIOURS.empath = { ...original, onExecution: (ctx) => { seen.push({ holderId: ctx.holderId, real: ctx.real }); } };
    act(g, { type: 'record_execution', playerId: g.p.scarlet_woman, died: true });
    expect(seen).toEqual([{ holderId: g.p.empath, real: true }]);
    seen.length = 0;
    BEHAVIOURS.empath = { ...BEHAVIOURS.empath, onExecutionBelieved: true };
    act(g, { type: 'mark_alive', playerId: g.p.scarlet_woman, alive: true });
    act(g, { type: 'record_execution', playerId: g.p.scarlet_woman, died: true });
    expect(seen).toEqual([{ holderId: g.p.empath, real: true }, { holderId: g.p.clockmaker, real: false }]);
  });
});
