// The steward's console: what the whole table knows, and their own phone. Every field here is built from something
// public. Nothing may read a character, an ability or a night's resolution, but for whether its questions are answered.
import type { PlayerId, PublicDay, StewardView } from '@ct/protocol';
import { Reader } from '../derive/reader';
import type { GameState, Nomination } from '../model/state';
import { phaseMoment } from '../model/state';
import { resolveNight } from '../night/wake';
import {
  block,
  canUndo,
  claimsOf,
  DAWN_MS,
  executionQuestions,
  notDone,
  questionsDue,
  todaysNominations,
  votesNeeded,
} from '../phases/autoplay';
import { findRole } from '../abilities/registry';
import { scriptFit } from '../setup/deal';
import { baseCounts } from '../setup/rules';
import { phaseView, playerView, story, type ProjectOptions } from './project';

/** The next moment, after `now`, at which a view changes with nothing having happened. Null when there is none. */
export function nextChangeAt(s: GameState, now: number): number | null {
  const p = s.phase;
  if (s.stewardId === null || p.kind !== 'night') return null;
  const closedAt = s.autoplay?.closedAt ?? null;
  const times = [
    p.stage === 'collecting' ? p.deadline : null,
    closedAt === null ? null : closedAt + DAWN_MS,
    closedAt === null ? null : questionsDue(s, closedAt),
  ];
  return times.reduce<number | null>((soonest, t) => {
    if (t === null || t <= now) return soonest;
    return soonest === null ? t : Math.min(soonest, t);
  }, null);
}

function nightPart(s: GameState, options: ProjectOptions): StewardView['night'] {
  const p = s.phase;
  if (p.kind !== 'night' || p.stage === 'briefing') return null;
  const { now } = options;
  const closedAt = s.autoplay?.closedAt ?? null;
  const left = p.stage === 'collecting' ? notDone(s) : [];
  const late = p.stage === 'collecting' && p.deadline !== null && now >= p.deadline;
  const closed = closedAt !== null;
  const ripe = closed && now >= closedAt + DAWN_MS;
  // Not looked at until dawn could be called, so that nothing before then can depend on it.
  const waiting = ripe && resolveNight(s).questions.some((q) => !q.answered);
  return {
    notDone: left.length,
    names: late ? left : null,
    closed,
    dawnAt: closed ? closedAt + DAWN_MS : null,
    dawn: !closed ? null : !ripe ? 'soon' : waiting ? 'waiting' : 'ready',
    canSkip: waiting && now >= questionsDue(s, closedAt as number),
    stuck: !!options.stuck,
  };
}

function dayPart(s: GameState): StewardView['day'] {
  const p = s.phase;
  const a = s.autoplay;
  if (p.kind !== 'day' || !a) return null;
  const nominations = todaysNominations(s);
  return {
    nominations: nominations.map((x) => ({
      id: x.id,
      nominator: x.nominator,
      nominee: x.nominee,
      lines: x.lines,
      vote: x.vote && { voters: x.vote.voters, needed: x.vote.needed },
      canUndo: canUndo(s, x),
    })),
    block: block(nominations),
    needed: votesNeeded(s),
    claims: claimsOf(s).map(({ roleId, def }) => ({
      roleId,
      claim: def.claim,
      title: def.title,
      fields: [...def.fields],
      confirm: def.says,
    })),
    claimed: a.record.flatMap((x) =>
      x.kind === 'claim' && x.at.kind === 'day' && x.at.n === p.n ? [{ text: x.text, lines: x.lines }] : [],
    ),
    executionQuestions: executionQuestions(s),
    closed: a.dayClosed,
  };
}

/** What the latest thing to happen left to tell the table. Nothing once the night has begun. */
function tell(s: GameState): string[] {
  const p = s.phase;
  if (p.kind !== 'day') return [];
  const last = s.autoplay?.record.findLast((x) => x.lines.length && x.at.kind === 'day' && x.at.n === p.n);
  return last ? [...(last.text ? [last.text] : []), ...last.lines] : [];
}

const voteLine = (r: Reader, x: Nomination | undefined): string[] => {
  if (!x?.vote) return [];
  const { voters, needed } = x.vote;
  const who = voters.length ? ` (${voters.map((id) => r.name(id)).join(', ')})` : '';
  return [`${voters.length} voted for ${r.name(x.nominee)}${who}. ${needed} needed.`];
};

/** The public game so far, day by day. */
export function publicStory(s: GameState, r: Reader): PublicDay[] {
  const out: PublicDay[] = [];
  for (const x of s.autoplay?.record ?? []) {
    let day = out.at(-1);
    if (day?.n !== x.at.n) out.push((day = { n: x.at.n, lines: [] }));
    const nomination = s.autoplay?.nominations.find((y) => y.id === x.nomination);
    day.lines.push(...(x.text ? [x.text] : []), ...x.lines, ...voteLine(r, nomination));
  }
  return out;
}

function revealed(s: GameState, r: Reader): StewardView['revealed'] {
  if (s.phase.kind !== 'ended') return null;
  return {
    story: story(s, r),
    players: r.seated.map((id) => {
      const x = r.player(id);
      return {
        id,
        name: x.name,
        character: x.character,
        believed: s.setup.bag.get(id) ?? null,
        alignment: x.alignment,
        alive: x.life.alive,
      };
    }),
    bluffs: [...s.setup.bluffs],
  };
}

export function stewardView(s: GameState, id: PlayerId, options: ProjectOptions): StewardView {
  const r = new Reader(s, phaseMoment(s));
  const p = s.phase;
  const a = s.autoplay;
  const before = p.kind === 'lobby' || p.kind === 'setup';
  const roster = [...r.seated, ...[...s.players.keys()].filter((x) => !r.seated.includes(x))];
  const { countdownSeconds, followUpExtensionSeconds, announceDeaths, evilInfoPolicy } = s.settings;
  return {
    kind: 'steward',
    code: s.code,
    meId: id,
    serverNow: options.now,
    phase: phaseView(s),
    me: playerView(s, id, options.now),
    settings: { countdownSeconds, followUpExtensionSeconds, announceDeaths, evilInfoPolicy },
    players: roster.map((pid, seat) => {
      const x = r.player(pid);
      const alive = !s.publicDead.includes(pid);
      return {
        id: pid,
        name: x.name,
        seat: seat < r.seated.length ? seat : null,
        connected: !!options.presence?.[pid],
        away: !!a?.away.includes(pid),
        alive,
        votesLeft: alive || !x.life.ghostVoteUsed,
      };
    }),
    script: s.script.filter((x) => findRole(x)),
    dropped: a?.dropped ?? [],
    seatingPublished: s.seatingPublished,
    setup: {
      counts: baseCounts(s, r.seated.length),
      source: s.setup.rules.countsOverride ? 'override' : 'default',
      fit: before ? scriptFit(s) : [],
    },
    seenRole:
      p.kind === 'night' && p.stage === 'briefing'
        ? { seen: r.seated.filter((x) => r.player(x).hasSeenRole).length, of: r.seated.length }
        : null,
    night: nightPart(s, options),
    day: dayPart(s),
    tell: tell(s),
    over: a?.over ?? null,
    offered: a?.offered ?? null,
    publicStory: publicStory(s, r),
    revealed: revealed(s, r),
  };
}
