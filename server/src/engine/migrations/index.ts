// Saved-game migration steps (design.md section 5.5). Only ENDED games are migrated (server/src/upgrade.ts ends any
// other game first), so a step never has to understand night state. Steps read only the saved data: never import
// ROLES, DEFAULT_SETTINGS or engine helpers; write any values a step needs into the step itself.
import { v5 } from './v5';
import { v6 } from './v6';

/** A saved game as loose JSON: steps must not assume today's GameState. */
export type SavedGame = Record<string, any>;
export type MigrationStep = (s: SavedGame) => void;

/** Oldest saved-game schema this release can upgrade. Every public release has written v4. */
export const MIN_SUPPORTED_SCHEMA = 4;

/** STEPS[n] upgrades a game from v(n-1) to vn, for MIN_SUPPORTED_SCHEMA < n <= SCHEMA_VERSION. */
export const STEPS: Record<number, MigrationStep> = { 5: v5, 6: v6 };
