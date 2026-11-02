// v5 -> v6: the script becomes a list of the role ids that were on, so a role added by a later release is simply
// absent (off) in existing games. Also adds endedReason.
import type { SavedGame } from './index';

export function v6(s: SavedGame) {
  const map = (s.enabledRoles ?? {}) as Record<string, unknown>;
  s.script = Object.keys(map).filter((id) => map[id] === true);
  delete s.enabledRoles;
  s.endedReason ??= null;
}
