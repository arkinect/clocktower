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
    submissions: {},
    decisions: {},
    overrides: {},
    answers: {},
    malfunctionAdjust: { add: [], remove: [] },
    followUpsExtended: false,
  };
}
