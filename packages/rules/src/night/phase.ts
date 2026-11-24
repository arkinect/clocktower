import type { NightPhase } from '../model/state';

export function newNightPhase(
  n: number,
  seed: number,
  stage: NightPhase['stage'],
  deadline: number | null,
): NightPhase {
  return {
    kind: 'night',
    n,
    stage,
    deadline,
    seed,
    submissions: new Map(),
    decisions: new Map(),
    overrides: new Map(),
    answers: new Map(),
    malfunctionAdjust: { add: [], remove: [] },
    followUpsExtended: false,
  };
}
