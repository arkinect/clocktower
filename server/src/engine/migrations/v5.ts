// v4 -> v5: undoes the withdrawn release v0.3.0, which wrote schema v5 with four extra roles (Fisherman, Zealot,
// Organ Grinder, Baron) that this app doesn't have. Schema v5 is taken for good. Every game passes through here: a
// v4 game as step 5, a game v0.3.0 saved at v5 at the start of step 6 (index.ts). It removes every stored role id
// of those four, so on real v4 data it changes nothing, except dropping an ended game's last night, which the v7
// step drops anyway. Text already shown to people (messages, story outcomes, notes) is left as written.
import type { SavedGame } from './index';

/** The roles v0.3.0 added. Written out here: steps never read ROLES. */
const WITHDRAWN = ['fisherman', 'zealot', 'organ_grinder', 'baron'];
const gone = (id: unknown) => typeof id === 'string' && WITHDRAWN.includes(id);
/** "drunk:organ_grinder" -> caused by a withdrawn role. */
const goneCause = (c: unknown) => typeof c === 'string' && gone(c.split(':')[1]);

export function v5(s: SavedGame) {
  // The script (v0.3.0 added the four ids, on or off, to every game).
  const map = s.enabledRoles as Record<string, unknown> | undefined;
  if (map) for (const id of WITHDRAWN) delete map[id];

  // Roles held, believed, gained and passed through.
  for (const a of Object.values((s.assignments ?? {}) as Record<string, SavedGame>)) {
    if (gone(a.roleId)) a.roleId = null;
    if (gone(a.believedRoleId)) a.believedRoleId = null;
    if (a.grantedAbility && gone(a.grantedAbility.roleId)) a.grantedAbility = null;
    for (const h of (a.history ?? []) as SavedGame[]) {
      if (gone(h.from)) h.from = null;
      if (gone(h.to)) h.to = null;
    }
  }

  // Setup choices.
  const setup = (s.setup ?? {}) as SavedGame;
  if (Array.isArray(setup.demonBluffs)) setup.demonBluffs = setup.demonBluffs.filter((id: unknown) => !gone(id));
  if (gone(setup.lilMonstaMinionRole)) setup.lilMonstaMinionRole = null;

  // Effects the Organ Grinder caused on itself.
  if (Array.isArray(s.effects)) s.effects = s.effects.filter((e: SavedGame) => !gone(e.cause));

  // The Storyteller's story: each night's roles, causes and actions.
  for (const entry of (s.story ?? []) as SavedGame[]) {
    for (const p of (entry.players ?? []) as SavedGame[]) {
      if (gone(p.roleId)) p.roleId = null;
      if (gone(p.believedRoleId)) p.believedRoleId = null;
      if (Array.isArray(p.causes)) p.causes = p.causes.filter((c: unknown) => !goneCause(c));
      if (Array.isArray(p.actions)) p.actions = p.actions.filter((x: SavedGame) => !gone(x.roleId));
    }
  }

  // Only ended games are migrated, and an ended game's last night (submissions, resolution, the world after it) is
  // never read again but can name the four roles throughout.
  s.night = null;
}
