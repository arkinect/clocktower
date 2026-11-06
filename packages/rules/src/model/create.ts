import type { GameId } from '@ct/protocol';
import { defaultScript } from '../abilities/registry';
import { DEFAULT_SETTINGS, ENGINE_VERSION, type GameState } from './state';

export function createGame(code: string, now: number): GameState {
  return {
    version: ENGINE_VERSION,
    id: `game-${code}` as GameId,
    code,
    createdAt: now,
    seq: 0,
    idSeq: 1,
    phase: { kind: 'lobby' },
    players: {},
    storytellerId: null,
    seats: [],
    seatingPublished: false,
    publishedSeating: [],
    script: defaultScript(),
    storytellerCharacters: [],
    abilities: {},
    conditions: [],
    setup: { bluffs: [], bag: {}, rules: { countsOverride: null } },
    events: [],
    inbox: {},
    pendingNotices: [],
    prompts: [],
    gameEnd: [],
    dismissedGameEnd: [],
    publicDead: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
