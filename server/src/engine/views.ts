// Per-recipient views. This is the hidden-information boundary: a player view contains only that player's data.
import { ROLE_BY_ID, TYPE_CHART, WORDS, type AdminView, type GameState, type PlayerView, type RoleCard } from '@ct/shared';
import { actionSpecs, ravenkeeperSpec, wakingRoles } from './actions';
import { godfatherTriggered } from './roles';
import { computeImpairment } from './impairment';
import { expectedActors } from './game';
import { actualCounts, setupChecklist, setupWarnings, targetCounts } from './setup';
import { findPlayer, inPlayRoleIds, roleIdOf, seated, seatedIds } from './world';

function card(roleId: string): RoleCard {
  const r = ROLE_BY_ID[roleId];
  return { roleId: r.id, name: r.name, type: r.type, abilityText: r.abilityText };
}

/** The role a player is shown: believed role for the Drunk and Marionette. */
export function shownRoleId(s: GameState, pid: string): string | null {
  const a = s.assignments[pid];
  if (!a?.roleId) return null;
  if ((a.roleId === 'drunk' || a.roleId === 'marionette') && a.believedRoleId) return a.believedRoleId;
  if (a.roleId === 'drunk' || a.roleId === 'marionette') return null;
  return a.roleId;
}

export function playerView(s: GameState, pid: string, now: number): PlayerView {
  const me = findPlayer(s, pid)!;
  const revealed = s.phase !== 'LOBBY' && s.phase !== 'SETUP';
  const shown = revealed ? shownRoleId(s, pid) : null;
  const night = s.night;
  const collecting = s.phase === 'NIGHT_COLLECTING' && !!night?.collectingOpen;
  const ravenPrompt = s.phase === 'NIGHT_RESOLVING' && !!night?.resolution?.awaitingRavenkeeper.includes(pid) && !night.ravenSubmissions[pid];
  const sub = night && (s.phase === 'NIGHT_COLLECTING' || s.phase === 'NIGHT_RESOLVING') ? night.submissions[pid] ?? null : null;
  return {
    kind: 'player',
    gameCode: s.code,
    phase: s.phase,
    nightNumber: s.nightNumber,
    dayNumber: s.dayNumber,
    nightEndsAt: s.phase === 'NIGHT_COLLECTING' || s.phase === 'NIGHT_RESOLVING' ? s.nightEndsAt : null,
    collectingOpen: collecting,
    serverNow: now,
    me: {
      id: me.id, name: me.name, isAdmin: false, alive: me.alive, hasSeenRole: me.hasSeenRole, ghostVoteUsed: me.ghostVoteUsed,
      role: shown ? card(shown) : null,
      submitted: !!sub,
      submission: sub,
      actions: collecting && me.seat !== null ? actionSpecs(s, pid) : [],
      ravenkeeperPrompt: ravenPrompt,
      messages: revealed ? (s.messages[pid] ?? []) : [],
    },
    players: s.players.map((p) => ({
      id: p.id, name: p.name, isAdmin: p.isAdmin,
      seat: s.seatingPublished ? (s.publishedSeating.indexOf(p.id) >= 0 ? s.publishedSeating.indexOf(p.id) : null) : null,
    })),
    seatingPublished: s.seatingPublished,
    seating: s.seatingPublished ? s.publishedSeating.filter((id) => findPlayer(s, id)) : [],
    deaths: s.settings.announceDeaths && revealed ? (s.publicDead ?? []).slice() : null,
    deadAtDawn: revealed ? (s.publicDead ?? []).slice() : [],
    enabledRoles: Object.keys(s.enabledRoles).filter((r) => s.enabledRoles[r]),
    hasAdmin: !!s.adminId,
  };
}

/** Ravenkeeper picker sent alongside the view when prompted. */
export function ravenkeeperPicker(s: GameState) {
  return ravenkeeperSpec(s);
}

export function adminView(s: GameState, pid: string, now: number, presence: Record<string, boolean>): AdminView {
  const night = Math.max(0, s.nightNumber);
  const imp = computeImpairment(s, night);
  const actorActions: AdminView['actorActions'] = {};
  const actorSpecs: AdminView['actorSpecs'] = {};
  if (s.night) {
    for (const id of seatedIds(s)) {
      actorActions[id] = wakingRoles(s, id).map((r) => ({ roleId: r, title: ROLE_BY_ID[r].name }));
      actorSpecs[id] = actionSpecs(s, id);
    }
  }
  const tc = targetCounts(s, seatedIds(s).length, inPlayRoleIds(s));
  return {
    kind: 'admin', serverNow: now, state: s, meId: pid, impairment: imp,
    expectedActors: expectedActors(s), actorActions, actorSpecs,
    setupChecklist: setupChecklist(s),
    typeCounts: { target: tc.counts, actual: actualCounts(s), source: tc.source, chartOutsiders: TYPE_CHART[Math.max(5, Math.min(15, seatedIds(s).length))][1] },
    godfatherTriggered: godfatherTriggered(s, Math.max(0, s.nightNumber)),
    warnings: setupWarnings(s),
    presence,
    wordList: WORDS,
  };
}

export { roleIdOf };
