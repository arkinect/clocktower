// What each player is sent: the Storyteller's or the steward's console, or their own phone.
import type { PlayerId, View } from '@ct/protocol';
import type { GameState } from '../model/state';
import { playerView, storytellerView, type ProjectOptions } from './project';
import { stewardView } from './steward';

export function project(s: GameState, viewer: PlayerId, options: ProjectOptions): View {
  if (viewer === s.storytellerId) return storytellerView(s, viewer, options);
  if (viewer === s.stewardId) return stewardView(s, viewer, options);
  return playerView(s, viewer, options.now);
}
