// v7 -> v8: groundwork for the Cannibal and start information. Every new field is optional or derived, so the step
// only stamps the version:
// - Assignment.eatenAbility is optional (absent = none).
// - roleState.startInfoPending replaces roleState.grandmotherInfoPending. Only ended games are migrated, and an ended
//   game's role memory is never read again (Play again starts a fresh one), so an old grandmotherInfoPending is left
//   as written.
// - Effect causes 'organ_grinder' and 'cannibal', and ActionField kind 'option', are new values no v7 game holds.
import type { SavedGame } from './index';

export function v8(s: SavedGame) {
  s.schemaVersion = 8;
}
