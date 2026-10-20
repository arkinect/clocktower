// The game reducer: (GameState, actor, Intent) -> (GameState, events). Pure apart from `now` and `seed` inputs.
import {
  ROLE_BY_ID, ROLES, SCHEMA_VERSION, TYPE_CHART, WORDS,
  type AdminIntent, type GameState, type Intent, type JoinRequest, type NightState, type PlayerIntent,
  type PlayerRec, type PrivateMessage, type RolePreference, type Settings, type StoryPlayer,
} from '@ct/shared';
import { actionSpecs, ravenkeeperSpec, validateChoice, validateSubmission } from './actions';
import { becomeDemon, demonInfoLines } from './demon';
import { computeImpairment } from './impairment';
import { previewDayKill, revivePlayer } from './lifecycle';
import { resolveNight } from './night';
import { makeRng, randomSeed } from './rng';
import {
  bluffCandidates, enabledRoles, redHerringCandidates, setupChecklist, suggestBluffs, suggestDistribution,
} from './setup';
import {
  aliveIds, canAct, findPlayer, flag, hasAbility, inPlayRoleIds, isDemon, playersWithAbility, roleIdOf, roleName, seatedIds,
} from './world';

export interface Ctx { now: number; seed?: number }
export interface GameEvent { type: string; actor: string | null; payload: unknown }
export type ApplyResult = { ok: true; state: GameState; events: GameEvent[]; data?: unknown } | { ok: false; error: string };

export const DEFAULT_SETTINGS: Settings = {
  countdownSeconds: 300,
  ravenkeeperExtensionSeconds: 120,
  announceDeaths: false,
  notifyOnRoleChange: true,
};

export function createGame(code: string, now: number): GameState {
  return {
    schemaVersion: SCHEMA_VERSION, id: `game-${code}`, code, phase: 'LOBBY', nightNumber: -1, dayNumber: 0, scriptId: 'all-39',
    settings: { ...DEFAULT_SETTINGS }, nightEndsAt: null, createdAt: now,
    enabledRoles: Object.fromEntries(ROLES.map((r) => [r.id, true])),
    adminId: null, seatingPublished: false, publishedSeating: [], days: {}, night: null,
    messages: {}, pendingNotices: {}, dayPrompts: [], story: [], publicDead: [], idSeq: 1,
    players: [], assignments: {}, flags: {}, effects: [], roleState: {},
    setup: {
      demonBluffs: [], redHerringId: null, lilMonstaMinionRole: null, lilMonstaTokenHolderId: null,
      mezephelesWord: null, mezephelesSpent: false, typeCountsOverride: null, shabalothKills: [], briefingSeen: false,
      godfatherOutsiders: null, damselGuessUsed: false, damselGuessResult: null,
    },
  };
}

const err = (error: string): ApplyResult => ({ ok: false, error });

function nextId(s: GameState, prefix: string): string {
  return `${prefix}${s.idSeq++}`;
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const n = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 24) return null;
  return n;
}

function nameTaken(s: GameState, name: string, exceptId?: string): boolean {
  return s.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
}

// ---- joining (not an intent: there is no actor yet) ------------------------------------------
export function joinPlayer(state: GameState, req: JoinRequest, token: string, now: number):
  { ok: true; state: GameState; player: PlayerRec; notice?: string } | { ok: false; error: string } {
  const s = structuredClone(state);
  const name = cleanName(req.name);
  if (!name) return { ok: false, error: 'Enter a name of 1 to 24 characters.' };
  if (nameTaken(s, name)) return { ok: false, error: 'That name is already taken. If it is you, use "I\'m already in this game".' };
  const prefs: RolePreference[] = ['townsfolk', 'outsider', 'minion', 'demon', 'none'];
  let notice: string | undefined;
  let isAdmin = false;
  // If a Storyteller already exists the request is simply treated as a normal join (no notice).
  if (req.wantsAdmin && !s.adminId) isAdmin = true;
  const p: PlayerRec = {
    id: nextId(s, 'p'), name, rolePreference: prefs.includes(req.rolePreference) ? req.rolePreference : 'none', isAdmin,
    seat: null, tokens: [token], alive: true, deadAt: null, deathCause: null, ghostVoteUsed: false, lastSeenAt: now, hasSeenRole: false, joinedAt: now,
  };
  s.players.push(p);
  if (isAdmin) s.adminId = p.id;
  else if (s.phase !== 'LOBBY' && s.phase !== 'SETUP') notice = (notice ? notice + ' ' : '') + 'The game is already running. The Storyteller can seat you next game.';
  return { ok: true, state: s, player: p, notice };
}

export function rebindPlayer(state: GameState, playerId: string, token: string): { ok: true; state: GameState } | { ok: false; error: string } {
  const s = structuredClone(state);
  const p = s.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'No such player.' };
  p.tokens.push(token);
  if (p.tokens.length > 10) p.tokens = p.tokens.slice(-10);
  return { ok: true, state: s };
}

// ---- messages ---------------------------------------------------------------------------------
function msg(s: GameState, night: number, kind: PrivateMessage['kind'], title: string, lines: string[]): PrivateMessage {
  return { id: nextId(s, 'm'), night, kind, title, lines };
}

function deliver(s: GameState, pid: string, m: PrivateMessage) {
  (s.messages[pid] ??= []).push(m);
}

function startingInfo(s: GameState) {
  for (const pid of seatedIds(s)) {
    const r = roleIdOf(s, pid);
    if (isDemon(s, pid)) deliver(s, pid, msg(s, 0, 'starting', 'Demon information', demonInfoLines(s, pid)));
    if (r === 'mezepheles' && s.setup.mezephelesWord) deliver(s, pid, msg(s, 0, 'starting', 'Your secret word', [`The word is: ${s.setup.mezephelesWord}`]));
    if (damselNoticeFor(s, pid)) deliver(s, pid, damselMsg(s));
    if (knowsMinions(s, pid)) deliver(s, pid, msg(s, 0, 'starting', 'Your fellow Minions', fellowMinionLines(s, pid)));
  }
}

/**
 * Owner change: on Night 0 the Minions learn each other (names only, not characters). They are still not told
 * who the Demon is. The Marionette does not know they are a Minion, so they learn nothing and are not listed.
 */
function knowsMinions(s: GameState, pid: string): boolean {
  const r = roleIdOf(s, pid);
  return !!r && ROLE_BY_ID[r].type === 'minion' && r !== 'marionette';
}
function fellowMinionLines(s: GameState, pid: string): string[] {
  const others = seatedIds(s).filter((id) => id !== pid && knowsMinions(s, id)).map((id) => findPlayer(s, id)!.name);
  return [others.length ? `The other Minions are: ${others.join(', ')}.` : 'You are the only Minion.', 'The Demon will reveal themselves to you at the table.'];
}

/** design.md section 8: every Minion except the Marionette learns a Damsel is in play (not who). */
function damselNoticeFor(s: GameState, pid: string): boolean {
  const r = roleIdOf(s, pid);
  return !!r && ROLE_BY_ID[r].type === 'minion' && r !== 'marionette' && inPlayRoleIds(s).includes('damsel');
}
function damselMsg(s: GameState): PrivateMessage {
  return msg(s, 0, 'starting', 'Damsel', ['A Damsel is in play.']);
}

// ---- helpers ------------------------------------------------------------------------------------
function newNight(number: number, seed: number, collectingOpen: boolean): NightState {
  return {
    number, collectingOpen, submissions: {}, ravenSubmissions: {}, seed, reviewChoices: {}, overrides: {},
    mathAdjust: { add: [], remove: [] }, resolution: null,
  };
}

export function expectedActors(s: GameState): string[] {
  return seatedIds(s).filter((id) => canAct(s, id));
}

function reresolve(s: GameState) {
  if (s.phase === 'NIGHT_RESOLVING' && s.night) s.night.resolution = resolveNight(s);
}

function clearRoleTies(s: GameState, pid: string) {
  delete s.flags[pid];
  delete s.roleState[pid];
  s.effects = s.effects.filter((e) => e.sourcePlayerId !== pid);
  const a = s.assignments[pid];
  if (a) { a.grantedAbility = null; a.retainsAbilityWhenDead = false; }
}

function setRole(s: GameState, pid: string, roleId: string | null, reason: string, now: number) {
  const prev = s.assignments[pid];
  const from = prev?.roleId ?? null;
  const natural = roleId ? ROLE_BY_ID[roleId].alignment : 'good';
  s.assignments[pid] = {
    roleId, believedRoleId: null, alignment: natural, retainsAbilityWhenDead: false, grantedAbility: null,
    history: [...(prev?.history ?? []), { at: now, from, to: roleId, reason }],
  };
}

function markDead(s: GameState, pid: string, alive: boolean, cause: string) {
  const p = findPlayer(s, pid);
  if (!p || p.alive === alive) return;
  if (alive) {
    revivePlayer(s, pid);
    if (s.phase === 'DAY') deliver(s, pid, msg(s, s.nightNumber, 'notice', 'You are alive again', ['You have been brought back to life.']));
    return;
  }
  const aliveBefore = aliveIds(s).length;
  const night = s.nightNumber < 0 ? 0 : s.nightNumber;
  const imp = computeImpairment(s, night)[pid];
  if (hasAbility(s, pid, 'moonchild', night)) (s.roleState[pid] ??= {}).soberAtDeath = !imp?.impaired;
  p.alive = false;
  p.deadAt = s.phase === 'NIGHT_COLLECTING' || s.phase === 'NIGHT_RESOLVING' ? { phase: 'night', number: s.nightNumber } : { phase: 'day', number: s.dayNumber };
  p.deathCause = cause;
  if (s.phase === 'DAY' || s.phase === 'ENDED') deliver(s, pid, msg(s, s.nightNumber, 'notice', 'You have died', ['You are dead. Keep your eyes closed at night unless your ability says otherwise.']));
  if (isDemon(s, pid) && aliveBefore >= 5) {
    const imps = computeImpairment(s, night);
    for (const sw of playersWithAbility(s, 'scarlet_woman', night)) {
      if (sw === pid || !findPlayer(s, sw)?.alive || imps[sw]?.impaired) continue;
      s.dayPrompts.push({
        id: nextId(s, 'dp'), kind: 'scarlet_woman', demonId: pid, scarletId: sw,
        title: `${findPlayer(s, sw)!.name} (Scarlet Woman) becomes the Demon?`,
        description: `${p.name} was the Demon and died with ${aliveBefore} players alive.`,
      });
      break;
    }
  }
}

function isAdminIntent(i: Intent): i is AdminIntent {
  return !['seen_role', 'use_ghost_vote', 'submit_night', 'submit_ravenkeeper', 'claim_admin'].includes(i.type);
}

// ---- reducer ------------------------------------------------------------------------------------
export function applyIntent(state: GameState, actorId: string, intent: Intent, ctx: Ctx): ApplyResult {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return err('Unknown player.');
  if (!intent || typeof intent !== 'object' || typeof intent.type !== 'string') return err('Bad request.');
  const s = structuredClone(state);
  let res: ApplyResult;
  try {
    if (isAdminIntent(intent)) {
      if (!actor.isAdmin || s.adminId !== actorId) return err('Only the Storyteller can do that.');
      res = adminIntent(s, intent, ctx);
    } else {
      res = playerIntent(s, actor.id, intent, ctx);
    }
  } catch (e) {
    return err(`Internal error: ${(e as Error).message}`);
  }
  if (!res.ok) return res;
  if (intent.type !== 'publish_night') reresolve(res.state);
  // The event log is Storyteller-only, so it records the full intent.
  return { ...res, events: [{ type: intent.type, actor: actorId, payload: intent }, ...res.events] };
}

function ok(s: GameState, data?: unknown): ApplyResult {
  return { ok: true, state: s, events: [], data };
}

function playerIntent(s: GameState, pid: string, intent: PlayerIntent, ctx: Ctx): ApplyResult {
  const me = findPlayer(s, pid)!;
  switch (intent.type) {
    case 'claim_admin': {
      if (s.adminId) return err('There is already a Storyteller.');
      me.isAdmin = true;
      me.seat = null;
      delete s.assignments[pid];
      s.adminId = pid;
      return ok(s);
    }
    case 'seen_role': {
      me.hasSeenRole = true;
      return ok(s);
    }
    case 'use_ghost_vote': {
      // A dead player records spending their one vote. Only the Storyteller can give it back.
      if (me.isAdmin || me.seat === null || me.alive) return err('Only dead players have a ghost vote.');
      me.ghostVoteUsed = true;
      return ok(s);
    }
    case 'submit_night': {
      if (s.phase !== 'NIGHT_COLLECTING' || !s.night?.collectingOpen) return err('The night is not collecting choices right now.');
      if (me.isAdmin || me.seat === null) return err('You are not seated in this game.');
      const specs = actionSpecs(s, pid);
      if (!specs.length) {
        // Non-actor: acknowledgement only. Identical response to a real submit.
        s.night.submissions[pid] = { actions: {}, submittedAt: ctx.now };
        return ok(s);
      }
      const v = validateSubmission(s, pid, intent.actions ?? {});
      if (!v.ok) return err(v.error);
      s.night.submissions[pid] = { actions: v.actions, submittedAt: ctx.now };
      return ok(s);
    }
    case 'submit_ravenkeeper': {
      if (s.phase !== 'NIGHT_RESOLVING' || !s.night?.resolution?.awaitingRavenkeeper.includes(pid)) return err('You cannot do that now.');
      const e = validateChoice(ravenkeeperSpec(s), { values: [intent.targetId] });
      if (e) return err(e);
      s.night.ravenSubmissions[pid] = { actions: { ravenkeeper: { values: [intent.targetId] } }, submittedAt: ctx.now };
      return ok(s);
    }
  }
  return err('Unknown request.');
}

function adminIntent(s: GameState, i: AdminIntent, ctx: Ctx): ApplyResult {
  const now = ctx.now;
  const rng = makeRng(ctx.seed ?? randomSeed());
  const inSetupish = s.phase === 'LOBBY' || s.phase === 'SETUP';
  const seatedPlayer = (id: string) => seatedIds(s).includes(id);

  switch (i.type) {
    // ---------- lobby ----------
    case 'rename_player': {
      const p = findPlayer(s, i.playerId);
      const name = cleanName(i.name);
      if (!p || !name) return err('Invalid name.');
      if (!inSetupish) return err('Players can only be renamed before the game starts.');
      if (nameTaken(s, name, p.id)) return err('That name is taken.');
      p.name = name;
      return ok(s);
    }
    case 'remove_player': {
      if (!inSetupish) return err('Players can only be removed before the game starts.');
      if (i.playerId === s.adminId) return err('The Storyteller cannot be removed.');
      s.players = s.players.filter((p) => p.id !== i.playerId);
      delete s.assignments[i.playerId];
      renumberSeats(s, seatedIds(s));
      return ok(s);
    }
    case 'go_setup': {
      if (s.phase !== 'LOBBY') return err('Not in the lobby.');
      s.phase = 'SETUP';
      const unseated = s.players.filter((p) => !p.isAdmin && p.seat === null).sort((a, b) => a.joinedAt - b.joinedAt);
      renumberSeats(s, [...seatedIds(s), ...unseated.map((p) => p.id)]);
      return ok(s);
    }

    // ---------- setup ----------
    case 'set_role_enabled': {
      if (!ROLE_BY_ID[i.roleId]) return err('Unknown role.');
      s.enabledRoles[i.roleId] = !!i.enabled;
      return ok(s);
    }
    case 'set_all_roles_enabled': {
      for (const r of ROLES) s.enabledRoles[r.id] = !!i.enabled;
      return ok(s);
    }
    case 'set_seating': {
      const ids = (i.order ?? []).filter((id) => s.players.some((p) => p.id === id && !p.isAdmin));
      if (new Set(ids).size !== ids.length) return err('Duplicate players in seating.');
      for (const p of s.players) if (!ids.includes(p.id)) p.seat = null;
      renumberSeats(s, ids);
      return ok(s);
    }
    case 'randomise_seating': {
      renumberSeats(s, rng.shuffle(s.players.filter((p) => !p.isAdmin).map((p) => p.id)));
      return ok(s);
    }
    case 'publish_seating': {
      s.seatingPublished = true;
      s.publishedSeating = seatedIds(s);
      return ok(s);
    }
    case 'assign_role': {
      if (!seatedPlayer(i.playerId)) return err('Seat the player first.');
      if (i.roleId !== null) {
        if (!ROLE_BY_ID[i.roleId]) return err('Unknown role.');
        if (!s.enabledRoles[i.roleId]) return err('That role is disabled.');
        if (seatedIds(s).some((id) => id !== i.playerId && roleIdOf(s, id) === i.roleId)) return err('That role is already assigned.');
      }
      const old = roleIdOf(s, i.playerId);
      if (old === i.roleId) return ok(s);
      const live = !inSetupish;
      if (live) clearRoleTies(s, i.playerId);
      setRole(s, i.playerId, i.roleId, live ? 'Admin reassignment' : 'setup', now);
      if (live && s.settings.notifyOnRoleChange && i.roleId) {
        const r = ROLE_BY_ID[i.roleId];
        deliver(s, i.playerId, msg(s, s.nightNumber, 'notice', 'Your role has changed', [`You are now the ${r.name}.`, r.abilityText]));
      }
      return ok(s);
    }
    case 'assign_many': {
      const entries = Object.entries(i.assignments ?? {});
      const roles = entries.map(([, r]) => r);
      if (new Set(roles).size !== roles.length) return err('Duplicate roles.');
      for (const [pid, r] of entries) {
        if (!seatedPlayer(pid) || !ROLE_BY_ID[r] || !s.enabledRoles[r]) return err('Invalid assignment.');
      }
      const touched = new Set(entries.map(([pid]) => pid));
      for (const id of seatedIds(s)) if (!touched.has(id) && roles.includes(roleIdOf(s, id) ?? '')) setRole(s, id, null, 'setup', now);
      for (const [pid, r] of entries) if (roleIdOf(s, pid) !== r) setRole(s, pid, r, inSetupish ? 'setup' : 'Admin reassignment', now);
      return ok(s);
    }
    case 'suggest_distribution': {
      const sug = suggestDistribution(s, rng);
      if ('error' in sug) return err(sug.error as string);
      return ok(s, sug);
    }
    case 'set_alignment': {
      if (!s.assignments[i.playerId] || (i.alignment !== 'good' && i.alignment !== 'evil')) return err('Invalid.');
      s.assignments[i.playerId].alignment = i.alignment;
      return ok(s);
    }
    case 'set_believed_role': {
      const a = s.assignments[i.playerId];
      if (!a || (a.roleId !== 'drunk' && a.roleId !== 'marionette')) return err('Only the Drunk or Marionette has a believed role.');
      if (i.roleId !== null) {
        const r = ROLE_BY_ID[i.roleId];
        if (!r || !s.enabledRoles[i.roleId]) return err('Unknown or disabled role.');
        if (inPlayRoleIds(s).includes(i.roleId)) return err('That role is in play.');
        if (a.roleId === 'drunk' && r.type !== 'townsfolk') return err('The Drunk must believe a Townsfolk.');
        if (a.roleId === 'marionette' && r.alignment !== 'good') return err('The Marionette must believe a good role.');
        if (seatedIds(s).some((id) => id !== i.playerId && s.assignments[id]?.believedRoleId === i.roleId)) return err('Another player already believes that role.');
      }
      a.believedRoleId = i.roleId;
      return ok(s);
    }
    case 'set_type_counts': {
      if (i.counts === null) { s.setup.typeCountsOverride = null; return ok(s); }
      const c = i.counts;
      if (!Array.isArray(c) || c.length !== 4 || c.some((x) => !Number.isInteger(x) || x < 0)) return err('Counts must be four whole numbers.');
      const n = seatedIds(s).length;
      if (c.reduce((a, b) => a + b, 0) !== n) return err(`Counts must add up to the player count (${n}).`);
      s.setup.typeCountsOverride = [c[0], c[1], c[2], c[3]];
      return ok(s);
    }
    case 'set_bluffs': {
      const ids = (i.roleIds ?? []).filter(Boolean);
      if (ids.length > 3 || new Set(ids).size !== ids.length) return err('Choose up to 3 different roles.');
      const cands = bluffCandidates(s);
      if (ids.some((r) => !cands.includes(r))) return err('Bluffs must be enabled good roles that are not in play.');
      s.setup.demonBluffs = ids;
      return ok(s);
    }
    case 'suggest_bluffs': {
      const b = suggestBluffs(s, rng);
      if (b.length < 3) return err('Not enough good roles out of play for 3 bluffs.');
      s.setup.demonBluffs = b;
      return ok(s);
    }
    case 'set_red_herring': {
      if (i.playerId !== null && (!seatedPlayer(i.playerId) || s.assignments[i.playerId]?.alignment !== 'good')) return err('The red herring must be a good player.');
      s.setup.redHerringId = i.playerId;
      return ok(s);
    }
    case 'suggest_red_herring': {
      const c = redHerringCandidates(s);
      if (!c.length) return err('No eligible good player.');
      s.setup.redHerringId = rng.pick(c);
      return ok(s);
    }
    case 'set_mezepheles_word': {
      const w = cleanName(i.word);
      if (!w) return err('Enter a word (max 24 characters).');
      s.setup.mezephelesWord = w;
      return ok(s);
    }
    case 'random_mezepheles_word': {
      s.setup.mezephelesWord = rng.pick(WORDS);
      return ok(s);
    }
    case 'set_lil_monsta_minion': {
      if (i.roleId !== null) {
        const r = ROLE_BY_ID[i.roleId];
        if (!r || r.type !== 'minion' || !s.enabledRoles[i.roleId] || inPlayRoleIds(s).includes(i.roleId)) return err('Choose an enabled Minion that is not in play.');
      }
      s.setup.lilMonstaMinionRole = i.roleId;
      return ok(s);
    }
    case 'set_setting': {
      const k = i.key as keyof Settings;
      const cur = s.settings[k];
      if (cur === undefined) return err('Unknown setting.');
      if (typeof cur === 'boolean') {
        if (typeof i.value !== 'boolean') return err('Expected true/false.');
        (s.settings as unknown as Record<string, unknown>)[k] = i.value;
      } else {
        const v = Number(i.value);
        if (!Number.isFinite(v) || v < 10 || v > 3600) return err('Expected seconds between 10 and 3600.');
        (s.settings as unknown as Record<string, unknown>)[k] = Math.round(v);
      }
      return ok(s);
    }
    case 'set_lil_monsta_holder': {
      if (i.playerId !== null && !seatedPlayer(i.playerId)) return err('Invalid player.');
      s.setup.lilMonstaTokenHolderId = i.playerId;
      return ok(s);
    }

    // ---------- night ----------
    case 'begin_night0': {
      if (s.phase !== 'SETUP') return err('Night 0 starts from Setup.');
      if (!seatedIds(s).length) return err('Nobody is seated.');
      if (!i.force) {
        const missing = setupChecklist(s).filter((c) => c.blocking && !c.done);
        if (missing.length) return err(`Setup is incomplete: ${missing.map((m) => m.label).join('; ')}`);
        if (!enabledRoles(s).some((r) => ROLE_BY_ID[r].type === 'demon')) return err('No Demon is enabled.');
      }
      s.phase = 'NIGHT_COLLECTING';
      s.nightNumber = 0;
      s.night = newNight(0, ctx.seed ?? randomSeed(), false);
      s.nightEndsAt = null;
      if (!s.seatingPublished) { s.seatingPublished = true; s.publishedSeating = seatedIds(s); }
      for (const p of s.players) p.hasSeenRole = false;
      startingInfo(s);
      return ok(s);
    }
    case 'start_collecting': {
      if (s.phase !== 'NIGHT_COLLECTING' || !s.night) return err('Not in a night.');
      s.night.collectingOpen = true;
      s.nightEndsAt = now + s.settings.countdownSeconds * 1000;
      return ok(s);
    }
    case 'start_night': {
      if (s.phase !== 'DAY') return err('A night can only start from the day.');
      const n = s.nightNumber + 1;
      recordDayStory(s);
      s.effects = s.effects.filter((e) => e.expiry !== 'until_dusk');
      for (const pid of Object.keys(s.messages)) s.messages[pid] = s.messages[pid].filter((m) => m.kind === 'starting');
      for (const [pid, list] of Object.entries(s.pendingNotices)) for (const m of list) deliver(s, pid, { ...m, night: n });
      s.pendingNotices = {};
      s.phase = 'NIGHT_COLLECTING';
      s.nightNumber = n;
      s.night = newNight(n, ctx.seed ?? randomSeed(), true);
      s.nightEndsAt = now + s.settings.countdownSeconds * 1000;
      return ok(s);
    }
    case 'extend_countdown': {
      const add = Math.max(0, Math.min(3600, Number(i.seconds) || 0)) * 1000;
      s.nightEndsAt = Math.max(s.nightEndsAt ?? now, now) + add;
      return ok(s);
    }
    case 'set_countdown': {
      const sec = Math.round(Number(i.seconds));
      if (!Number.isFinite(sec) || sec < 10 || sec > 3600) return err('Countdown must be 10 to 3600 seconds.');
      s.settings.countdownSeconds = sec;
      if (s.phase === 'NIGHT_COLLECTING' && s.night?.collectingOpen) s.nightEndsAt = now + sec * 1000;
      return ok(s);
    }
    case 'submit_for': {
      if (s.phase !== 'NIGHT_COLLECTING' || !s.night) return err('Not collecting.');
      if (!seatedPlayer(i.playerId)) return err('Not a seated player.');
      const v = validateSubmission(s, i.playerId, i.actions ?? {}, true);
      if (!v.ok) return err(v.error);
      s.night.submissions[i.playerId] = { actions: v.actions, submittedAt: now, byAdmin: true };
      return ok(s);
    }
    case 'mark_no_action': {
      if (s.phase !== 'NIGHT_COLLECTING' || !s.night) return err('Not collecting.');
      const actions = Object.fromEntries(actionSpecs(s, i.playerId).map((sp) => [sp.key, { decline: true, values: [] }]));
      s.night.submissions[i.playerId] = { actions, submittedAt: now, byAdmin: true };
      return ok(s);
    }
    case 'clear_submission': {
      if (s.phase !== 'NIGHT_COLLECTING' || !s.night) return err('Not collecting.');
      delete s.night.submissions[i.playerId];
      return ok(s);
    }
    case 'resolve_night': {
      if (s.phase !== 'NIGHT_COLLECTING' || !s.night) return err('Not collecting.');
      if (!i.force) {
        if (!s.night.collectingOpen) return err('Collecting has not started.');
        const pending = expectedActors(s).filter((id) => !s.night!.submissions[id]);
        const timeUp = s.nightEndsAt !== null && now >= s.nightEndsAt;
        if (pending.length && !timeUp) return err(`Waiting for ${pending.length} player(s). Wait for the countdown or force.`);
      }
      s.night.collectingOpen = true;
      s.phase = 'NIGHT_RESOLVING';
      s.night.resolution = resolveNight(s);
      if (s.night.resolution.awaitingRavenkeeper.length) s.nightEndsAt = Math.max(s.nightEndsAt ?? now, now) + s.settings.ravenkeeperExtensionSeconds * 1000;
      return ok(s);
    }
    case 'reopen_collecting': {
      if (s.phase !== 'NIGHT_RESOLVING' || !s.night) return err('Not resolving.');
      s.phase = 'NIGHT_COLLECTING';
      s.night.resolution = null;
      return ok(s);
    }
    case 'choose_review': {
      const early = i.key === 'godfather_trigger' && s.phase === 'NIGHT_COLLECTING';
      if ((s.phase !== 'NIGHT_RESOLVING' && !early) || !s.night) return err('Not resolving.');
      if (i.optionId === null) delete s.night.reviewChoices[i.key];
      else s.night.reviewChoices[i.key] = String(i.optionId);
      return ok(s);
    }
    case 'accept_all_defaults': {
      if (s.phase !== 'NIGHT_RESOLVING' || !s.night) return err('Not resolving.');
      for (let k = 0; k < 6; k++) {
        const res = resolveNight(s);
        const open = res.reviewItems.filter((it) => it.chosen === null);
        if (!open.length) break;
        for (const it of open) s.night.reviewChoices[it.key] = it.default;
      }
      return ok(s);
    }
    case 'override_result': {
      if (s.phase !== 'NIGHT_RESOLVING' || !s.night) return err('Not resolving.');
      if (i.lines === null) delete s.night.overrides[i.key];
      else if (Array.isArray(i.lines)) s.night.overrides[i.key] = i.lines.map((l) => String(l).slice(0, 300)).slice(0, 10);
      return ok(s);
    }
    case 'math_adjust': {
      if (s.phase !== 'NIGHT_RESOLVING' || !s.night) return err('Not resolving.');
      s.night.mathAdjust = { add: (i.add ?? []).filter(seatedPlayer), remove: (i.remove ?? []).filter(seatedPlayer) };
      return ok(s);
    }
    case 'ravenkeeper_for': {
      if (s.phase !== 'NIGHT_RESOLVING' || !s.night?.resolution) return err('Not resolving.');
      const e = validateChoice(ravenkeeperSpec(s), { values: [i.targetId] });
      if (e) return err(e);
      s.night.ravenSubmissions[i.playerId] = { actions: { ravenkeeper: { values: [i.targetId] } }, submittedAt: now, byAdmin: true };
      return ok(s);
    }
    case 'publish_night': {
      if (s.phase !== 'NIGHT_RESOLVING' || !s.night) return err('Not resolving.');
      const res = resolveNight(s);
      if (res.awaitingRavenkeeper.length && !i.force) return err('Waiting for the Ravenkeeper. Submit for them or force.');
      publish(s, res);
      return ok(s);
    }

    // ---------- day ----------
    case 'mark_alive': {
      if (!seatedPlayer(i.playerId)) return err('Not a seated player.');
      markDead(s, i.playerId, !!i.alive, 'storyteller');
      return ok(s);
    }
    case 'record_execution': {
      if (s.phase !== 'DAY') return err('Executions are recorded during the day.');
      const d = dayRecord(s);
      if (i.playerId !== null && !seatedPlayer(i.playerId)) return err('Not a seated player.');
      d.executedPlayerId = i.playerId;
      if (i.playerId && i.died) markDead(s, i.playerId, false, 'execution');
      return ok(s);
    }
    case 'set_day_fact': {
      if (s.phase !== 'DAY') return err('Day facts are recorded during the day.');
      const d = dayRecord(s);
      switch (i.key) {
        case 'demonVoted': d.demonVoted = i.value === null ? null : !!i.value; break;
        case 'jugglerCorrect': {
          const v = i.value === null ? null : Number(i.value);
          if (v !== null && (!Number.isInteger(v) || v < 0 || v > 5)) return err('0 to 5.');
          d.jugglerCorrect = v;
          break;
        }
        case 'moonchildTargetId': {
          const v = i.value as string | null;
          if (v !== null && (!seatedPlayer(v) || !findPlayer(s, v)?.alive)) return err('Choose an alive player.');
          d.moonchildTargetId = v;
          break;
        }
        case 'mezephelesSayer': {
          const v = i.value as string | null;
          if (v !== null && !seatedPlayer(v)) return err('Not a seated player.');
          if (v !== null && (s.setup.mezephelesSpent || Object.values(s.days).some((x) => x.mezephelesSayer && x.dayNumber !== d.dayNumber))) return ok(s); // only the first counts
          d.mezephelesSayer = v;
          break;
        }
        case 'gossipStatement': {
          if (i.value !== 'none' && i.value !== 'true' && i.value !== 'false') return err('None, True or False.');
          d.gossipStatement = i.value;
          break;
        }
        case 'notes': d.notes = String(i.value ?? '').slice(0, 2000); break;
        default: return err('Unknown fact.');
      }
      return ok(s);
    }
    case 'set_ghost_vote': {
      const p = findPlayer(s, i.playerId);
      if (!p || !seatedPlayer(i.playerId)) return err('Not a seated player.');
      if (p.alive) return err('Only dead players have a ghost vote to use.');
      p.ghostVoteUsed = !!i.used;
      return ok(s);
    }
    case 'set_flag': {
      if (!seatedPlayer(i.playerId) || typeof i.key !== 'string') return err('Invalid.');
      (s.flags[i.playerId] ??= {})[i.key] = !!i.value;
      return ok(s);
    }
    case 'resolve_day_prompt': {
      const dp = s.dayPrompts.find((d) => d.id === i.id);
      if (!dp) return err('Already handled.');
      s.dayPrompts = s.dayPrompts.filter((d) => d.id !== i.id);
      if (i.accept) {
        becomeDemon(s, dp.scarletId, dp.demonId, (pid, title, lines) => {
          (s.pendingNotices[pid] ??= []).push(msg(s, s.nightNumber + 1, 'notice', title, lines));
        });
      }
      return ok(s);
    }
    case 'remove_effect': {
      s.effects = s.effects.filter((e) => e.id !== i.effectId);
      return ok(s);
    }
    case 'add_effect': {
      if (!seatedPlayer(i.targetId) || (i.effectType !== 'poisoned' && i.effectType !== 'drunk')) return err('Invalid.');
      s.effects.push({ id: nextId(s, 'e'), type: i.effectType, cause: 'admin', sourcePlayerId: null, targetPlayerId: i.targetId, startNight: Math.max(0, s.nightNumber), expiry: 'until_dusk' });
      return ok(s);
    }
    case 'set_godfather_outsiders': {
      if (i.value !== null && i.value !== 1 && i.value !== -1) return err('Choose -1 or +1.');
      if (i.value === -1 && chartOutsiders(s) === 0) return err('The default chart has no Outsiders for this player count, so only +1 is possible.');
      s.setup.godfatherOutsiders = i.value;
      return ok(s);
    }
    case 'set_godfather_trigger': {
      if (!s.night) return err('Not in a night.');
      if (i.value === null) delete s.night.reviewChoices['godfather_trigger'];
      else s.night.reviewChoices['godfather_trigger'] = i.value ? 'yes' : 'no';
      return ok(s);
    }
    case 'day_kill': {
      if (s.phase !== 'DAY') return err('Day kills happen during the day.');
      if (!seatedPlayer(i.targetId) || !seatedPlayer(i.sourceId)) return err('Invalid player.');
      const night = Math.max(0, s.nightNumber);
      const imp = computeImpairment(s, night);
      const tname = findPlayer(s, i.targetId)!.name;
      let effect: { wouldDie: boolean; reason: string; usesFool: boolean };
      let witchedId: string | null = null;
      if (i.kind === 'slayer') {
        if (!hasAbility(s, i.sourceId, 'slayer', night)) return err('That player is not the Slayer.');
        if (flag(s, i.sourceId, 'slayer_used')) return err('The Slayer has already used their shot.');
        if (!findPlayer(s, i.sourceId)!.alive) return err('The Slayer must be alive.');
        const isRecluse = hasAbility(s, i.targetId, 'recluse', night) && !imp[i.targetId]?.impaired;
        const regDemon = isRecluse && i.recluseAs ? i.recluseAs === 'demon' : isDemon(s, i.targetId);
        if (imp[i.sourceId]?.impaired) effect = { wouldDie: false, reason: 'The Slayer is drunk or poisoned: nothing happens.', usesFool: false };
        else if (!regDemon) effect = { wouldDie: false, reason: `${tname} is not the Demon: nothing happens.`, usesFool: false };
        else effect = previewDayKill(s, i.targetId, night);
      } else {
        const curse = s.effects.find((e) => e.type === 'witched' && e.targetPlayerId === i.targetId);
        if (!curse) return err('That player is not cursed (or the curse was already applied).');
        witchedId = curse.id;
        effect = previewDayKill(s, i.targetId, night);
      }
      if (i.mode === 'preview') return ok(s, effect);
      if (i.kind === 'slayer') (s.flags[i.sourceId] ??= {}).slayer_used = true;
      if (witchedId) s.effects = s.effects.filter((e) => e.id !== witchedId);
      const die = i.mode === 'force_death' || (i.mode === 'accept' && effect.wouldDie);
      if (i.mode === 'accept' && effect.usesFool) (s.flags[i.targetId] ??= {}).fool_used = true;
      if (die) markDead(s, i.targetId, false, i.kind === 'slayer' ? 'slayer' : 'witch');
      return ok(s, { ...effect, died: die });
    }
    case 'damsel_guess': {
      if (s.phase !== 'DAY') return err('Guesses are recorded during the day.');
      if (!inPlayRoleIds(s).includes('damsel') && !s.players.some((p) => s.assignments[p.id]?.history.some((h) => h.from === 'damsel'))) return err('No Damsel is in play.');
      if (s.setup.damselGuessUsed) return err('The evil team has already used its Damsel guess.');
      if (!seatedPlayer(i.targetId)) return err('Invalid player.');
      const night = Math.max(0, s.nightNumber);
      s.setup.damselGuessUsed = true;
      const name = findPlayer(s, i.targetId)!.name;
      let res: NonNullable<GameState['setup']['damselGuessResult']>;
      if (roleIdOf(s, i.targetId) !== 'damsel') res = { targetId: i.targetId, outcome: 'wrong', text: `${name} is not the Damsel. Wrong guess, nothing happens.` };
      else if (!findPlayer(s, i.targetId)!.alive || computeImpairment(s, night)[i.targetId]?.impaired) res = { targetId: i.targetId, outcome: 'no_effect', text: 'The guess has no effect because the Damsel is drunk, poisoned or dead.' };
      else res = { targetId: i.targetId, outcome: 'win', text: 'The Damsel was guessed: the good team loses. Apply at the table.' };
      s.setup.damselGuessResult = res;
      return ok(s, res);
    }
    case 'set_damsel_guess_used': {
      s.setup.damselGuessUsed = !!i.value;
      if (!i.value) s.setup.damselGuessResult = null;
      return ok(s);
    }
    case 'end_game': {
      s.phase = 'ENDED';
      s.nightEndsAt = null;
      return ok(s);
    }
    case 'play_again': return ok(playAgain(s, ctx.now));
    case 'force_phase': {
      if (!['LOBBY', 'SETUP', 'DAY', 'ENDED'].includes(i.phase)) return err('Invalid phase.');
      if (i.phase === 'DAY' && s.nightNumber < 0) return err('Begin Night 0 first.');
      if (i.phase === 'DAY' && s.phase !== 'DAY') {
        s.dayNumber = s.nightNumber + 1;
        dayRecord(s);
      }
      s.phase = i.phase;
      s.nightEndsAt = null;
      return ok(s);
    }
  }
  return err('Unknown request.');
}

function chartOutsiders(s: GameState): number {
  const n = Math.max(5, Math.min(15, seatedIds(s).length));
  return TYPE_CHART[n][1];
}

/** Admin-only story: who was what, who was impaired and who they targeted, per night. */
function recordNightStory(s: GameState, res: NonNullable<NightState['resolution']>, n: number) {
  const endImp = computeImpairment(res.after, n);
  const players: StoryPlayer[] = seatedIds(s).map((pid) => {
    const p = findPlayer(s, pid)!;
    const a = s.assignments[pid];
    const rows = res.actors.filter((r) => r.playerId === pid);
    const causes = new Set<string>();
    for (const r of rows) for (const c of r.causes) causes.add(c);
    for (const c of endImp[pid]?.causes ?? []) causes.add(c);
    return {
      playerId: pid, name: p.name, seat: p.seat, roleId: a?.roleId ?? null, believedRoleId: a?.believedRoleId ?? null,
      alignment: a?.alignment ?? 'good', aliveAtStart: p.alive, aliveAtEnd: !!res.after.players.find((x) => x.id === pid)?.alive,
      impaired: causes.size > 0, causes: [...causes],
      actions: rows.map((r) => ({ slot: r.slot, roleId: r.roleId, input: r.input, outcome: r.outcome })),
      received: [
        ...res.results.filter((r) => r.playerId === pid).map((r) => ({
          title: r.title, lines: r.finalLines,
          ...(r.finalLines.join('\n') !== r.trueLines.join('\n') ? { trueLines: r.trueLines } : {}),
        })),
        ...res.notices.filter((x) => x.playerId === pid).map((x) => ({ title: x.title, lines: x.lines })),
      ],
    };
  });
  s.story.push({ kind: 'night', night: n, at: Date.now(), players, deaths: res.deaths.slice(), revived: res.revived.slice() });
}

function recordDayStory(s: GameState) {
  const d = s.days[s.dayNumber];
  const deaths = s.players.filter((p) => !p.alive && p.deadAt?.phase === 'day' && p.deadAt.number === s.dayNumber).map((p) => ({ playerId: p.id, cause: p.deathCause }));
  s.story.push({ kind: 'day', day: s.dayNumber, at: Date.now(), executedPlayerId: d?.executedPlayerId ?? null, deaths, notes: d?.notes ?? '' });
}

/** A fresh game in Setup that keeps the players, their seats, the enabled roles and the settings. */
function playAgain(s: GameState, now: number): GameState {
  const next = createGame(s.code, now);
  next.adminId = s.adminId;
  next.enabledRoles = s.enabledRoles;
  next.settings = s.settings;
  next.seatingPublished = s.seatingPublished;
  next.publishedSeating = s.publishedSeating;
  next.idSeq = s.idSeq;
  next.players = s.players.map((p) => ({
    ...p, alive: true, deadAt: null, deathCause: null, ghostVoteUsed: false, hasSeenRole: false,
  }));
  next.phase = 'SETUP';
  return next;
}

function renumberSeats(s: GameState, order: string[]) {
  order.forEach((id, idx) => {
    const p = findPlayer(s, id);
    if (p) p.seat = idx;
  });
}

function dayRecord(s: GameState) {
  return (s.days[s.dayNumber] ??= {
    dayNumber: s.dayNumber, executedPlayerId: null, demonVoted: null, jugglerCorrect: null,
    moonchildTargetId: null, mezephelesSayer: null, gossipStatement: 'none', notes: '',
  });
}

/** Section 9.5: one atomic step that commits the night and sends everyone to the day. */
function publish(s: GameState, res: NonNullable<NightState['resolution']>) {
  const n = s.night!.number;
  const before = new Set(aliveIds(s));
  recordNightStory(s, res, n);
  s.players = res.after.players;
  s.assignments = res.after.assignments;
  s.flags = res.after.flags;
  s.effects = res.after.effects;
  s.roleState = res.after.roleState;
  s.setup = res.after.setup;

  const got = new Set<string>();
  for (const r of res.results) {
    deliver(s, r.playerId, msg(s, n, 'result', r.title, r.finalLines));
    got.add(r.playerId);
  }
  for (const no of res.notices) deliver(s, no.playerId, msg(s, n, 'notice', no.title, no.lines));
  for (const pid of res.deaths) {
    if (!findPlayer(s, pid)?.alive && before.has(pid)) deliver(s, pid, msg(s, n, 'notice', 'You have died', ['You died in the night.']));
  }
  for (const pid of res.revived) deliver(s, pid, msg(s, n, 'notice', 'You are alive again', ['You have been brought back to life.']));

  // Lil' Monsta: at the end of Night 0 the Lil' Monsta player becomes the chosen Minion and holds the token.
  if (n === 0) {
    for (const pid of seatedIds(s)) {
      if (roleIdOf(s, pid) !== 'lil_monsta') continue;
      const m = s.setup.lilMonstaMinionRole;
      if (m) {
        setRole(s, pid, m, 'Lil\' Monsta becomes a Minion', Date.now());
        deliver(s, pid, msg(s, n, 'notice', `Your role is now ${roleName(m)}`, [ROLE_BY_ID[m].abilityText, 'You hold Lil\' Monsta\'s token. You are the Demon.']));
        if (damselNoticeFor(s, pid)) deliver(s, pid, damselMsg(s));
      }
      s.setup.lilMonstaTokenHolderId = pid;
    }
  }
  for (const pid of seatedIds(s)) {
    if (!got.has(pid) && !(s.messages[pid] ?? []).some((m) => m.night === n && m.kind === 'result')) {
      deliver(s, pid, msg(s, n, 'result', 'Tonight', ['You learned nothing.']));
    }
  }
  // Dawn: players' view of who is dead refreshes now (and only now).
  s.publicDead = seatedIds(s).filter((id) => !findPlayer(s, id)!.alive);
  s.phase = 'DAY';
  s.dayNumber = n + 1;
  s.nightEndsAt = null;
  dayRecord(s);
}
