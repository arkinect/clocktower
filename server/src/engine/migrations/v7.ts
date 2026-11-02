// v6 -> v7: the Ravenkeeper's second round became general follow-up questions. Only ended games are migrated, so
// the night (which held the old Ravenkeeper fields) is simply dropped, and the time setting is renamed.
import type { SavedGame } from './index';

export function v7(s: SavedGame) {
  s.night = null;
  const settings = (s.settings ?? {}) as Record<string, unknown>;
  settings.followUpExtensionSeconds = typeof settings.ravenkeeperExtensionSeconds === 'number' ? settings.ravenkeeperExtensionSeconds : 120;
  delete settings.ravenkeeperExtensionSeconds;
  s.settings = settings;
}
