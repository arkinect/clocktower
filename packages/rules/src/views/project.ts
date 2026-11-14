// Per-viewer projections: the hidden-information boundary. A player view shows another player's hidden data only
// through a delivered message, a public fact, or a visibility grant from an ability the viewer holds.
import { clone } from '../util/clone';
import type {
  AbilityView,
  ConditionView,
  PhaseView,
  PlayerId,
  PlayerView,
  RoleCard,
  RoleId,
  StoryEntry,
  StoryNight,
  StorytellerView,
} from '@ct/protocol';
import { roleCard } from '../abilities/define';
import type { Instance } from '../abilities/define';
import { allRoles, findRole, roleDef, scriptOrder } from '../abilities/registry';
import { computeImpairment } from '../derive/impairment';
import { Reader } from '../derive/reader';
import type { Condition, GameState, StoryRow } from '../model/state';
import { phaseMoment } from '../model/state';
import { HookCtx } from '../night/context';
import { Run } from '../night/run';
import { nightStory } from '../night/story';
import { actionSpecs, expectedActors, resolveNight, wakingAbilities } from '../night/wake';
import { setupFields } from '../phases/setup';
import {
  actualCounts,
  believedOptions,
  bluffCandidates,
  setupChecklist,
  setupWarnings,
  targetCounts,
} from '../setup/rules';

export interface ProjectOptions {
  now: number;
  presence?: Record<string, boolean>;
}

function phaseView(s: GameState): PhaseView {
  const p = s.phase;
  return {
    kind: p.kind,
    n: p.kind === 'night' || p.kind === 'day' ? p.n : -1,
    stage: p.kind === 'night' ? p.stage : null,
    deadline: p.kind === 'night' ? p.deadline : null,
    winner: p.kind === 'ended' ? p.winner : null,
    endedReason: p.kind === 'ended' ? p.reason : null,
  };
}

const card = (id: RoleId): RoleCard => roleCard(roleDef(id));

/** The role cards a client needs for this game: every role that can come up. */
export function catalog(s: GameState): RoleCard[] {
  const ids = new Set<RoleId>([...s.script, ...s.storytellerCharacters]);
  return scriptOrder([...ids]).map(card);
}

/** Every role the app knows, for choosing a script. */
export const allCards = (): RoleCard[] => allRoles().map(roleCard);

export function playerView(s: GameState, id: PlayerId, now: number): PlayerView {
  const me = s.players[id];
  if (!me) throw new Error(`No player ${id}`);
  const moment = phaseMoment(s);
  const r = new Reader(s, moment);
  const started = s.phase.kind !== 'lobby' && s.phase.kind !== 'setup';
  const seated = r.isSeated(id);
  const p = s.phase;
  const collecting = p.kind === 'night' && p.stage === 'collecting';
  const questions =
    p.kind === 'night' && p.stage === 'review'
      ? resolveNight(s)
          .questions.filter((q) => q.playerId === id && !q.answered)
          .map((q) => q.spec)
      : [];
  const sub = p.kind === 'night' ? (p.submissions[id] ?? null) : null;
  const hidden = r.instances.some((a) => roleDef(a.roleId).ability.hidesCharacter?.(new HookCtx(r, a), id));
  const shown = started && !hidden ? me.self.character : null;
  const grants = started
    ? r.abilitiesOf(id).flatMap((a) => roleDef(a.roleId).ability.visibility?.(new HookCtx(r, a)) ?? [])
    : [];
  return {
    kind: 'player',
    code: s.code,
    phase: phaseView(s),
    serverNow: now,
    me: {
      id,
      name: me.name,
      alive: me.life.alive,
      seated,
      hasSeenRole: me.hasSeenRole,
      ghostVoteUsed: me.life.ghostVoteUsed,
      role: shown ? card(shown) : null,
      submitted: !!sub,
      submission: sub?.actions ?? null,
      actions: collecting && seated ? actionSpecs(s, id) : [],
      questions,
      messages: started ? (s.inbox[id] ?? []) : [],
      grants,
    },
    players: Object.values(s.players).map((x) => {
      const seat = s.seatingPublished ? s.publishedSeating.indexOf(x.id) : -1;
      const traveller = started && r.typeOf(x.id) === 'traveller';
      return {
        id: x.id,
        name: x.name,
        seat: seat >= 0 ? seat : null,
        isStoryteller: x.id === s.storytellerId,
        publicRole: traveller ? x.character : null,
        exiled: x.removal?.kind === 'exiled',
      };
    }),
    seatingPublished: s.seatingPublished,
    deadAtDawn: started ? s.publicDead.slice() : [],
    announcedDeaths: s.settings.announceDeaths && started ? s.publicDead.slice() : null,
    script: s.script.filter((id) => findRole(id)),
    hasStoryteller: !!s.storytellerId,
  };
}

function abilityView(r: Reader, a: Instance): AbilityView {
  const def = roleDef(a.roleId);
  return {
    id: a.id,
    roleId: a.roleId,
    name: def.name,
    shownAs: a.shownAs,
    origin: a.origin.kind,
    perceivedOnly: a.perceivedOnly || r.isBelieved(a),
    used: a.used,
    active: r.isActive(a),
    oncePerGame: !!def.flags.oncePerGame,
    usageAuto: def.flags.oncePerGame === 'auto',
    reminder: def.reminder ?? null,
    dayReminder: !!def.flags.dayReminder,
    from: `${a.activeFrom.kind === 'night' ? 'Night' : 'Day'} ${a.activeFrom.n}`,
    survivesDeath: a.survivesDeath,
    summary: def.ability.summary?.(new HookCtx(r, a)) ?? [],
  };
}

function conditionView(r: Reader, c: Condition): ConditionView {
  const src = c.source.kind === 'ability' ? r.w.abilities[c.source.id] : null;
  const srcName = src ? (findRole(src.roleId)?.name ?? 'Unknown') : 'Storyteller';
  return {
    id: c.id,
    type: c.type,
    name: c.name ?? null,
    label: c.name ?? c.type,
    until: c.until,
    sourceLabel: srcName,
  };
}

function storyNight(n: number, rows: StoryRow[], deaths: PlayerId[], revived: PlayerId[]): StoryNight {
  return {
    kind: 'night',
    n,
    deaths,
    revived,
    rows: rows.map((row, seat) => ({
      playerId: row.playerId,
      seat,
      name: row.name,
      character: row.character,
      believed: row.believed,
      alignment: row.alignment,
      aliveAtStart: row.aliveAtStart,
      aliveAtEnd: row.aliveAtEnd,
      causes: row.causes,
      // The stored row keeps only the slot, and the engine version stays put for this.
      actions: row.actions.map((x) => ({ roleId: null, ...x })),
      received: row.received,
    })),
  };
}

function story(s: GameState, r: Reader): StoryEntry[] {
  const out: StoryEntry[] = [];
  for (const e of s.events) {
    if (e.kind !== 'night_record') continue;
    out.push(storyNight(e.at.n, e.rows, e.deaths, e.revived));
  }
  // Every day that has started: Day N goes before Night N.
  const days = new Set(s.events.filter((e) => e.at.kind === 'day').map((e) => e.at.n));
  for (const e of out) if (e.n >= 1) days.add(e.n);
  if (s.phase.kind === 'day') days.add(s.phase.n);
  for (const n of [...days].sort((x, y) => x - y)) {
    const today = s.events.filter((e) => e.at.kind === 'day' && e.at.n === n);
    const execution = today.findLast((e) => e.kind === 'execution');
    const note = today.findLast((e) => e.kind === 'note');
    const entry: StoryEntry = {
      kind: 'day',
      n,
      execution: execution?.kind === 'execution' ? { playerId: execution.playerId, died: execution.died } : null,
      deaths: today.flatMap((e) => (e.kind === 'death' ? [{ playerId: e.playerId, cause: e.cause }] : [])),
      other: dayLines(s, r, n)
        .filter((d) => d.kind !== 'execution' && d.kind !== 'death')
        .map((d) => d.text),
      notes: note?.kind === 'note' ? note.text : '',
    };
    const at = out.findIndex((x) => x.kind === 'night' && x.n === n);
    if (at >= 0) out.splice(at, 0, entry);
    else out.push(entry);
  }
  return out;
}

function dayLines(s: GameState, r: Reader, n: number) {
  const out: { at: string; kind: string; text: string; playerId: PlayerId | null }[] = [];
  for (const e of s.events) {
    if (e.at.kind !== 'day' || e.at.n !== n) continue;
    const at = `Day ${n}`;
    const subject = 'playerId' in e ? e.playerId : 'nominee' in e ? e.nominee : null;
    const add = (text: string) => out.push({ at, kind: e.kind, text, playerId: subject ?? null });
    if (e.kind === 'nomination')
      add(`${e.nominator ? r.name(e.nominator) : 'The Storyteller'} nominated ${r.name(e.nominee)}.`);
    if (e.kind === 'vote') add(`Vote on ${r.name(e.nominee)}${e.count === null ? '' : `: ${e.count}`}.`);
    if (e.kind === 'execution') {
      // Until dusk it is only today's choice.
      const today = s.phase.kind === 'day' && s.phase.n === n;
      if (!e.playerId) add(today ? 'No execution today.' : 'Nobody was executed.');
      else if (today) add(`${r.name(e.playerId)} is to be executed as the night starts.`);
      else add(`${r.name(e.playerId)} was executed${e.died ? ' and died' : ' and survived'}.`);
    }
    if (e.kind === 'exile') add(`${r.name(e.playerId)} was exiled.`);
    if (e.kind === 'statement') add(`${r.name(e.playerId)} stated: ${e.text}`);
    if (e.kind === 'death') add(`${r.name(e.playerId)} died (${e.cause.replaceAll('_', ' ')}).`);
    if (e.kind === 'revival') add(`${r.name(e.playerId)} came back to life.`);
    if (e.kind === 'broke_madness') add(`${r.name(e.playerId)} broke madness: ${e.ruling}`);
  }
  return out;
}

export function storytellerView(s: GameState, id: PlayerId, options: ProjectOptions): StorytellerView {
  const moment = phaseMoment(s);
  const r = new Reader(s, moment);
  const imp = computeImpairment(s, moment);
  const p = s.phase;
  const seatedIds = r.seated;
  const roster = [
    ...seatedIds,
    ...(Object.keys(s.players) as PlayerId[]).filter((x) => !seatedIds.includes(x) && x !== s.storytellerId),
  ];
  const players = roster.map((pid, seat) => {
    const x = s.players[pid]!;
    const i = imp[pid];
    return {
      id: pid,
      name: x.name,
      seat: seat < seatedIds.length ? seat : null,
      alive: x.life.alive,
      deathCause: x.life.cause,
      character: x.character,
      alignment: x.alignment,
      self: x.self,
      abilities: r.abilitiesOf(pid).map((a) => abilityView(r, a)),
      conditions: s.conditions.filter((c) => c.target === pid).map((c) => conditionView(r, c)),
      impaired: !!i?.impaired,
      causes: i?.causes ?? [],
      ghostVoteUsed: x.life.ghostVoteUsed,
      hasSeenRole: x.hasSeenRole,
      rolePreference: x.rolePreference,
      connected: !!options.presence?.[pid],
      departed: !!x.removal,
      isDemon: r.isDemon(pid),
    };
  });
  const counts = targetCounts(s, seatedIds.length, r.inPlay);
  const believed: Record<string, RoleId[]> = {};
  for (const pid of seatedIds) {
    const c = r.character(pid);
    if (c && roleDef(c).believes) believed[pid] = believedOptions(s, pid);
  }
  const expected = new Set(expectedActors(s));
  const board =
    p.kind === 'night'
      ? seatedIds.map((pid) => {
          const sub = p.submissions[pid];
          return {
            playerId: pid,
            wakes: wakingAbilities(s, pid).map((a) => ({ roleId: a.roleId, title: roleDef(a.roleId).name })),
            specs: actionSpecs(s, pid),
            expected: expected.has(pid),
            submitted: !!sub,
            byStoryteller: !!sub?.byStoryteller,
            submission: sub?.actions ?? null,
          };
        })
      : [];
  const res = p.kind === 'night' && p.stage === 'review' ? resolveNight(s) : null;
  const tonight = p.kind === 'night' ? p.n : 0;
  const run = p.kind === 'day' ? new Run({ world: clone(s) as GameState, moment, seed: 0, now: options.now }) : null;
  const dayActions = run
    ? run.reader.instances.flatMap((a) =>
        (roleDef(a.roleId).ability.dayActions?.(run.ctx(a)) ?? []).map((d) => ({
          ...run.fullSpec(a, `${a.id}:${d.action}`, { ...d, title: d.title ?? roleDef(a.roleId).name }),
          title: d.title ?? roleDef(a.roleId).name,
          roleId: a.roleId,
          abilityId: a.id,
          action: d.action,
          preview: d.preview ?? true,
          recorded: d.recorded ?? null,
          neededTonight: d.neededTonight ?? false,
          ...(d.blocksNight ? { blocksNight: true } : {}),
          order: d.order ?? 1000,
          control: d.control ?? 'select',
          default: d.default ?? null,
          ...(d.maxRows ? { maxRows: d.maxRows } : {}),
          ...(d.clearable ? { clearable: true } : {}),
          ...(d.emptyLabel ? { emptyLabel: d.emptyLabel } : {}),
        })),
      )
    : [];
  const dayNotices = run
    ? run.reader.instances.flatMap((a) => {
        const text = roleDef(a.roleId).ability.dayNotice?.(run.ctx(a));
        return text ? [text] : [];
      })
    : [];
  const note = [...s.events].reverse().find((e) => e.kind === 'note' && p.kind === 'day' && e.at.n === p.n);
  return {
    kind: 'storyteller',
    code: s.code,
    meId: id,
    serverNow: options.now,
    phase: phaseView(s),
    settings: s.settings,
    players,
    storytellerAbilities: r.instances.filter((a) => a.holder.kind !== 'player').map((a) => abilityView(r, a)),
    script: s.script.filter((id) => findRole(id)),
    seatingPublished: s.seatingPublished,
    setup: {
      checklist: setupChecklist(s),
      warnings: setupWarnings(s),
      counts: { target: counts.counts, actual: actualCounts(s), source: counts.source },
      bluffs: s.setup.bluffs,
      bluffCandidates: bluffCandidates(s),
      fields: setupFields(r),
      believedOptions: believed,
      storytellerCharacters: s.storytellerCharacters,
    },
    board,
    review: res
      ? {
          actors: res.actors,
          results: res.results.map(({ confirmation: _confirmation, ...row }) => row),
          decisions: res.decisions,
          questions: res.questions,
          notices: res.notices,
          deaths: res.deaths,
          revived: res.revived,
          malfunctions: res.malfunctions,
          malfunctionAdjust: p.kind === 'night' ? p.malfunctionAdjust : { add: [], remove: [] },
          gameEnd: res.gameEnd,
          log: res.log,
          story: storyNight(tonight, nightStory(s, res, tonight), res.deaths, res.revived),
        }
      : null,
    dayActions,
    dayEvents: p.kind === 'day' ? dayLines(s, r, p.n) : [],
    prompts: s.prompts.map(({ id: pid, title, description, options: opts }) => ({
      id: pid,
      title,
      description,
      options: opts,
    })),
    gameEnd: s.gameEnd,
    notes: note?.kind === 'note' ? note.text : '',
    dayNotices,
    story: story(s, r),
  };
}

export function project(s: GameState, viewer: PlayerId, options: ProjectOptions): PlayerView | StorytellerView {
  return viewer === s.storytellerId ? storytellerView(s, viewer, options) : playerView(s, viewer, options.now);
}
