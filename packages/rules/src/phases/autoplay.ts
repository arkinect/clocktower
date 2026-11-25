// Autoplay: the steward's commands, the private ones a player sends by day, and the steps the server takes by itself.
//
// The steward plays too, so nothing here may tell them anything the table does not know. A refusal may depend on public
// facts only, and an answer says what the table would see and no more.
import type { Command, PlayerId, RoleId } from '@ct/protocol';
import { autoplaySupport, notInAutoplay, type Instance } from '../abilities/define';
import { findRole, roleDef } from '../abilities/registry';
import { Reader } from '../derive/reader';
import { isAutoplay, newAutoplay, phaseMoment, SETUP_MOMENT } from '../model/state';
import type { Autoplay, GameState, Nomination, Phase, PublicRecord } from '../model/state';
import type { Run } from '../night/run';
import { actionSpecs, answerAtRandom, resolveNight } from '../night/wake';
import { deal, scriptFit } from '../setup/deal';
import { clone } from '../util/clone';
import { subRng } from '../util/rng';
import { dayActionsOf, dayValuesError, newGame, playAgain } from './day';
import { ALL_PHASES, defineCommand, need, type CmdCtx } from './define';
import { openSetup, removePlayer, renamePlayer } from './lobby';
import { nightfall, publish, sundown, tableDead } from './night';
import {
  applySettings,
  beginFirstNight,
  publishSeating,
  setCounts,
  setScript,
  setSeating,
  shuffleSeating,
} from './setup';

/** Dawn is never offered sooner than this after the night closes, so an ordinary answer to a question fits inside it. */
export const DAWN_MS = 30_000;

/** When the night's questions may be played on without. */
export const questionsDue = (s: GameState, closedAt: number): number =>
  closedAt + Math.max(DAWN_MS, s.settings.followUpExtensionSeconds * 1000);

const TOO_EARLY = 'The night is not over yet.';

type Ctx = Pick<CmdCtx<Phase['kind']>, 's' | 'r' | 'run' | 'now' | 'base' | 'seed' | 'moment' | 'rng'>;

/** The autoplay record of a game still being played: once it is decided, nothing is left but to announce it. */
function live(s: GameState): Autoplay {
  const a = s.autoplay;
  need(a, 'This is not an autoplay game.');
  need(!a.over, 'The game is over. Announce it.');
  return a;
}

/** The same, with the day still open. */
function openDay(s: GameState): Autoplay {
  const a = live(s);
  need(!a.dayClosed, 'The day is over.');
  return a;
}

function record(s: GameState, a: Autoplay, entry: Omit<PublicRecord, 'at'>) {
  a.record.push({ at: phaseMoment(s), ...entry });
}

const seatOrder = (r: Reader, ids: readonly PlayerId[]) => r.seated.filter((id) => ids.includes(id));

/** "Bo, Cy and Di" */
function listed(names: readonly string[]): string {
  const last = names.at(-1) ?? '';
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${last}` : last;
}

/** Who the table now sees dead, and alive again, since it last looked. In seat order, as any other would say something. */
function changes(s: GameState, run: Run): { died: PlayerId[]; back: PlayerId[] } {
  const dead = tableDead(run);
  const died = seatOrder(
    run.reader,
    dead.filter((id) => !s.publicDead.includes(id)),
  );
  const back = seatOrder(
    run.reader,
    s.publicDead.filter((id) => !dead.includes(id)),
  );
  s.publicDead = dead;
  return { died, back };
}

/** What the table saw come of something by day. */
function dayLines(s: GameState, run: Run): string[] {
  const { died, back } = changes(s, run);
  return [
    ...died.map((id) => `${run.reader.name(id)} dies.`),
    ...back.map((id) => `${run.reader.name(id)} is alive again.`),
    ...run.announced,
  ];
}

// ---- the game's end ----

type End = GameState['gameEnd'][number];

/** Good wins a tie. */
function decide(a: Autoplay, ends: readonly End[]) {
  if (!ends.length) return;
  a.over = { winner: ends.some((g) => g.winner === 'good') ? 'good' : (ends[0]?.winner ?? null) };
}

/**
 * After anything by day, or the sundown. A dead Demon ends nothing yet: the town hears of it at dawn, whoever is or is
 * not about to take over. Once nobody can, the game is settled, and only what an ability makes of the dead Demon
 * (`afterDemon`) still counts.
 */
function judgeDay(s: GameState, a: Autoplay, run: Run, o: { dusk?: boolean } = {}) {
  const { demons, isAlive } = run.reader;
  // Until dusk, an ability may still hold the end back because its holder takes over then.
  const held = !o.dusk && run.suppressed.has('no_demon');
  if (demons.length && !demons.some(isAlive) && !held) a.demonDead = true;
  decide(
    a,
    s.gameEnd.filter((g) => (a.demonDead ? run.afterDemon.has(g.key) : g.key !== 'no_demon')),
  );
}

function judgeDawn(s: GameState, a: Autoplay, run: Run, res: { demonFell: boolean; afterDemon: string[] }) {
  if (res.demonFell) a.demonDead = true;
  decide(
    a,
    s.gameEnd.filter((g) =>
      a.demonDead ? res.afterDemon.includes(g.key) || run.afterDemon.has(g.key) : g.key !== 'no_demon',
    ),
  );
  // The town wakes and the Demon is dead, unless an ability (an extra day) holds that back.
  if (a.demonDead && !a.over && !run.suppressed.has('no_demon')) a.over = { winner: 'good' };
}

// ---- the night ----

/** Plays on without this player: an optional ability is declined, and one that must choose chooses at random. */
function skip(ctx: Ctx, id: PlayerId) {
  const p = ctx.s.phase;
  if (p.kind !== 'night') return;
  // From the night's own seed, so it cannot be drawn again.
  const rng = subRng(p.seed, `skip:${id}`);
  const actions = Object.fromEntries(actionSpecs(ctx.base, id).map((spec) => [spec.key, answerAtRandom(spec, rng)]));
  p.submissions.set(id, { actions, at: ctx.now, byStoryteller: false });
}

/** Answers every question these players leave open, and any that follow from the answers. */
function answerFor(ctx: Ctx, who: (id: PlayerId) => boolean) {
  const p = ctx.s.phase;
  if (p.kind !== 'night') return;
  // Every answer closes a question, and a night has only so many.
  for (let i = 0; i < 60; i++) {
    const open = resolveNight(clone(ctx.s)).questions.find((q) => !q.answered && who(q.playerId));
    if (!open) return;
    const choice = answerAtRandom(open.spec, subRng(p.seed, `skip:${open.key}`));
    p.answers.set(open.key, { choice, byStoryteller: false, at: ctx.now });
  }
}

const isDone = (s: GameState, id: PlayerId) =>
  s.phase.kind === 'night' && (s.phase.submissions.has(id) || !!s.autoplay?.away.includes(id));

/** Seated players who have not pressed done. The absent are not waited for. */
export const notDone = (s: GameState): PlayerId[] =>
  new Reader(s, phaseMoment(s)).seated.filter((id) => !isDone(s, id));

/** What the server does next by itself, if anything is due. */
export function autopilotStep(s: GameState): Command | null {
  const p = s.phase;
  if (!isAutoplay(s) || p.kind !== 'night') return null;
  if (p.stage === 'collecting') return notDone(s).length ? null : { type: 'auto_close' };
  const away = s.autoplay?.awayTonight ?? [];
  if (p.stage !== 'review' || !away.length) return null;
  const open = resolveNight(s).questions.some((q) => !q.answered && away.includes(q.playerId));
  return open ? { type: 'auto_answer' } : null;
}

// ---- the day ----

/** What a role asks this player in private today. */
export function dayPrompts(run: Run, id: PlayerId) {
  return run.reader.abilitiesOf(id).flatMap((a) =>
    run.canAct(a, roleDef(a.roleId))
      ? dayActionsOf(run, a)
          .filter((d) => d.asksHolder)
          .map((d) => ({
            a,
            d,
            spec: run.fullSpec(a, `${a.id}:${d.action}`, {
              ...d,
              title: roleDef(a.roleId).name,
              prompt: d.asksHolder ?? '',
              allowDecline: !!d.clearable,
            }),
          }))
      : [],
  );
}

/** Votes it takes to put someone on the block: half the living. */
export const votesNeeded = (s: GameState): number =>
  Math.ceil(new Reader(s, phaseMoment(s)).seated.filter((id) => !s.publicDead.includes(id)).length / 2);

/** Who is on the block: at least the votes needed, more than the last, and a tie clears it. */
export function block(nominations: readonly Nomination[]): { playerId: PlayerId; votes: number } | null {
  let high = 0;
  let on: PlayerId | null = null;
  for (const x of nominations) {
    const votes = x.vote?.voters.length ?? 0;
    if (!x.vote || votes < x.vote.needed || votes < high) continue;
    on = votes > high ? x.nominee : null;
    high = votes;
  }
  return on ? { playerId: on, votes: high } : null;
}

export function todaysNominations(s: GameState): Nomination[] {
  const p = s.phase;
  return p.kind === 'day' ? (s.autoplay?.nominations.filter((x) => x.day === p.n) ?? []) : [];
}

/** The latest entry of the day, a nomination nothing has come of. */
export function canUndo(s: GameState, x: Nomination): boolean {
  const last = s.autoplay?.record.at(-1);
  return (
    !s.autoplay?.dayClosed && last?.nomination === x.id && last.kind === 'nomination' && !x.vote && !x.lines.length
  );
}

const executionToday = (s: GameState, n: number) => {
  const e = s.events.findLast((x) => x.kind === 'execution' && x.at.kind === 'day' && x.at.n === n);
  return e?.kind === 'execution' ? e : null;
};

/** The execution is done, and everything the day's end decides. The table is told at once. */
function closeDay(ctx: CmdCtx<'day'>, a: Autoplay): string[] {
  const id = executionToday(ctx.s, ctx.phase.n)?.playerId ?? null;
  const name = ctx.r.name(id);
  const wasDead = !!id && ctx.s.publicDead.includes(id);
  ctx.s.gameEnd = [];
  const run = sundown(ctx);
  a.dayClosed = true;
  judgeDay(ctx.s, a, run, { dusk: true });
  const { died, back } = changes(ctx.s, run);
  const how = wasDead ? 'was already dead' : died.includes(id as PlayerId) ? 'dies' : 'does not die';
  return [
    id ? `${name} is executed and ${how}.` : 'Nobody is executed.',
    ...died.filter((x) => x !== id).map((x) => `${run.reader.name(x)} dies.`),
    ...back.map((x) => `${run.reader.name(x)} is alive again.`),
    ...run.announced,
  ];
}

/** What a nomination changed, to put back if it is undone. */
function changedBy(base: GameState, s: GameState): Nomination['before'] {
  const same = (x: Instance, y: Instance) => x.used === y.used && JSON.stringify(x.state) === JSON.stringify(y.state);
  return {
    abilities: [...base.abilities.values()].flatMap((x) => {
      const now = s.abilities.get(x.id);
      return now && !same(x, now) ? [{ id: x.id, used: x.used, state: clone(x.state) }] : [];
    }),
    conditions: clone(base.conditions),
    events: base.events.length,
  };
}

const scriptOf = (s: GameState): RoleId[] => new Reader(s, phaseMoment(s)).script;

/** What can be claimed in public: from the script, whoever is in play. */
export const claimsOf = (s: GameState) =>
  scriptOf(s).flatMap((roleId) => (autoplaySupport(roleDef(roleId)).claims ?? []).map((def) => ({ roleId, def })));

/** What is asked at every execution, from the script. */
export const executionQuestions = (s: GameState) =>
  scriptOf(s).flatMap((roleId) => {
    const question = autoplaySupport(roleDef(roleId)).execution;
    return question ? [{ roleId, question }] : [];
  });

const setupish = ['lobby', 'setup'] as const;

/** The last seat, and on phones too if they have been shown the seats. */
function seat(s: GameState, id: PlayerId) {
  s.seats.push({ playerId: id, joined: SETUP_MOMENT, left: null });
  if (s.seatingPublished) s.publishedSeating.push(id);
}
const playing = ['night', 'day'] as const;

export const autoplayCommands = [
  defineCommand({
    type: 'choose_autoplay',
    by: 'storyteller',
    phases: setupish,
    handle(ctx) {
      const s = ctx.s;
      const unfit = (r: RoleId) => {
        const def = findRole(r);
        return !def || notInAutoplay(def) !== null;
      };
      s.stewardId = s.storytellerId;
      // Nobody is the Storyteller now, so nobody gets a Storyteller's view or commands.
      s.storytellerId = null;
      // There is no Storyteller to tell a player what they have become.
      s.settings.notifyOnRoleChange = true;
      s.autoplay = { ...newAutoplay(), dropped: s.script.filter(unfit) };
      s.script = s.script.filter((r) => !unfit(r));
      // They play, so they need a seat. Opening setup seats everyone, so there is none to take before that.
      if (s.phase.kind === 'setup' && s.stewardId) seat(s, s.stewardId);
    },
  }),
  defineCommand({
    type: 'leave_autoplay',
    by: 'steward',
    phases: setupish,
    handle(ctx) {
      const s = ctx.s;
      s.script = [...new Set([...s.script, ...(s.autoplay?.dropped ?? [])])];
      s.storytellerId = s.stewardId;
      s.stewardId = null;
      s.autoplay = null;
      s.seats = s.seats.filter((x) => x.playerId !== s.storytellerId);
      s.publishedSeating = s.publishedSeating.filter((id) => id !== s.storytellerId);
    },
  }),
  defineCommand({
    type: 'steward_rename',
    by: 'steward',
    phases: setupish,
    handle: (ctx, cmd) => renamePlayer(ctx, cmd.playerId, cmd.name),
  }),
  defineCommand({
    type: 'steward_remove',
    by: 'steward',
    phases: setupish,
    handle(ctx, cmd) {
      need(cmd.playerId !== ctx.s.stewardId, 'The steward cannot be removed.');
      removePlayer(ctx, cmd.playerId);
    },
  }),
  defineCommand({ type: 'steward_open_setup', by: 'steward', phases: ['lobby'], handle: (ctx) => openSetup(ctx) }),
  defineCommand({
    type: 'steward_script',
    by: 'steward',
    phases: setupish,
    handle(ctx, cmd) {
      for (const r of cmd.roleIds) {
        const def = findRole(r);
        const unfit = def && notInAutoplay(def);
        need(!unfit, `The ${def?.name} cannot be in an autoplay game. ${unfit}`);
      }
      setScript(ctx, cmd.roleIds);
    },
  }),
  defineCommand({
    type: 'steward_seating',
    by: 'steward',
    phases: setupish,
    handle: (ctx, cmd) => setSeating(ctx, cmd.order),
  }),
  defineCommand({ type: 'steward_shuffle', by: 'steward', phases: setupish, handle: (ctx) => shuffleSeating(ctx) }),
  defineCommand({
    type: 'steward_publish_seating',
    by: 'steward',
    phases: setupish,
    handle: (ctx) => publishSeating(ctx),
  }),
  defineCommand({
    type: 'steward_counts',
    by: 'steward',
    phases: ['setup'],
    handle(ctx, cmd) {
      need(!cmd.counts || cmd.counts[3] === 1, 'There must be 1 Demon.');
      setCounts(ctx, cmd.counts);
    },
  }),
  defineCommand({
    type: 'steward_settings',
    by: 'steward',
    phases: ['lobby', 'setup', 'night', 'day'],
    handle(ctx, cmd) {
      const { type: _type, ...settings } = cmd;
      applySettings(ctx, settings);
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'deal',
    by: 'steward',
    phases: ['setup'],
    handle(ctx) {
      const s = ctx.s;
      // Worded about the script and the table, never about who would hold what.
      need(s.players.size === ctx.r.seated.length, 'Seat everyone first.');
      const misfit = scriptFit(ctx.base);
      need(!misfit.length, misfit.join(' '));
      const dealt = deal(ctx.base, ctx.seed);
      need(dealt, `No legal set of characters could be found for ${ctx.r.seated.length} players on this script.`);
      s.players = dealt.players;
      s.abilities = dealt.abilities;
      s.conditions = dealt.conditions;
      s.setup = dealt.setup;
      s.storytellerCharacters = dealt.storytellerCharacters;
      s.idSeq = dealt.idSeq;
      beginFirstNight(ctx);
    },
  }),
  defineCommand({
    type: 'open_night',
    by: 'steward',
    phases: ['night'],
    handle(ctx) {
      live(ctx.s);
      need(ctx.phase.stage === 'briefing', 'The night is already open.');
      ctx.phase.stage = 'collecting';
      ctx.phase.deadline = ctx.now + ctx.s.settings.countdownSeconds * 1000;
    },
  }),
  defineCommand({
    type: 'add_time',
    by: 'steward',
    phases: ['night'],
    handle(ctx, cmd) {
      need(ctx.phase.stage === 'collecting', 'You cannot do that right now.');
      ctx.phase.deadline = Math.max(ctx.phase.deadline ?? ctx.now, ctx.now) + cmd.seconds * 1000;
    },
  }),
  defineCommand({
    type: 'skip_player',
    by: 'steward',
    phases: ['night'],
    handle(ctx, cmd) {
      const p = ctx.phase;
      need(p.stage === 'collecting', 'You cannot do that right now.');
      need(p.deadline !== null && ctx.now >= p.deadline, 'Wait for the countdown.');
      need(ctx.r.isSeated(cmd.playerId) && !isDone(ctx.base, cmd.playerId), 'They are done.');
      skip(ctx, cmd.playerId);
    },
  }),
  defineCommand({
    type: 'retry_night',
    by: 'steward',
    phases: ['night'],
    // Nothing to change: the server tries its next step again after every command.
    handle(ctx) {
      need(ctx.phase.stage !== 'briefing', 'You cannot do that right now.');
    },
  }),
  defineCommand({
    type: 'skip_questions',
    by: 'steward',
    phases: ['night'],
    handle(ctx) {
      const a = live(ctx.s);
      need(a.closedAt !== null && ctx.now >= questionsDue(ctx.s, a.closedAt), TOO_EARLY);
      answerFor(ctx, () => true);
    },
  }),
  defineCommand({
    type: 'call_dawn',
    by: 'steward',
    phases: ['night'],
    handle(ctx) {
      const a = live(ctx.s);
      need(ctx.phase.stage === 'review' && a.closedAt !== null && ctx.now >= a.closedAt + DAWN_MS, TOO_EARLY);
      const res = resolveNight(ctx.base);
      need(
        res.questions.every((q) => q.answered),
        TOO_EARLY,
      );
      const n = ctx.phase.n;
      const before = ctx.s.publicDead.slice();
      ctx.s.gameEnd = [];
      const run = publish(ctx.s, res, n, ctx.seed, ctx.now);
      // As the table knew it at dusk. `publish` has just brought it up to date.
      ctx.s.publicDead = before;
      const { died, back } = changes(ctx.s, run);
      a.lastNight = died;
      a.closedAt = null;
      a.awayTonight = [];
      a.dayClosed = false;
      judgeDawn(ctx.s, a, run, res);
      const name = (id: PlayerId) => run.reader.name(id);
      record(ctx.s, a, {
        kind: 'dawn',
        text: '',
        nomination: null,
        lines: [
          died.length ? `${listed(died.map(name))} died in the night.` : 'Nobody died in the night.',
          ...(back.length ? [`${listed(back.map(name))} ${back.length > 1 ? 'are' : 'is'} alive again.`] : []),
          ...res.announced,
        ],
      });
    },
  }),
  defineCommand({
    type: 'nominate',
    by: 'steward',
    phases: ['day'],
    handle(ctx, cmd) {
      const a = openDay(ctx.s);
      const { nominator, nominee } = cmd;
      need(ctx.r.isSeated(nominator) && ctx.r.isSeated(nominee), 'Not a seated player.');
      const n = ctx.phase.n;
      ctx.s.gameEnd = [];
      const run = ctx.run();
      for (const x of run.reader.instances) {
        roleDef(x.roleId).ability.onNomination?.(run.ctx(x), { nominator, nominee });
      }
      run.commitDay();
      const lines = dayLines(ctx.s, run);
      judgeDay(ctx.s, a, run);
      const before = changedBy(ctx.base, ctx.s);
      // An ability executed someone for it: the day is over.
      if (executionToday(ctx.s, n) && !a.over) lines.push(...closeDay(ctx, a));
      const id = a.idSeq++;
      a.nominations.push({ id, day: n, nominator, nominee, lines, vote: null, before });
      record(ctx.s, a, {
        kind: 'nomination',
        text: `${ctx.r.name(nominator)} nominates ${ctx.r.name(nominee)}.`,
        nomination: id,
        lines,
      });
    },
  }),
  defineCommand({
    type: 'undo_nomination',
    by: 'steward',
    phases: ['day'],
    handle(ctx, cmd) {
      const a = openDay(ctx.s);
      const x = a.nominations.find((y) => y.id === cmd.id);
      need(x && canUndo(ctx.s, x), 'It stands: something has come of it, or the day has moved on.');
      for (const was of x.before.abilities) {
        const ability = ctx.s.abilities.get(was.id);
        if (ability) Object.assign(ability, { used: was.used, state: clone(was.state) });
      }
      ctx.s.conditions = clone(x.before.conditions);
      ctx.s.events = ctx.s.events.slice(0, x.before.events);
      a.nominations = a.nominations.filter((y) => y.id !== cmd.id);
      record(ctx.s, a, {
        kind: 'undone',
        text: `${ctx.r.name(x.nominator)}'s nomination of ${ctx.r.name(x.nominee)} was entered by mistake.`,
        nomination: null,
        lines: [],
      });
    },
  }),
  defineCommand({
    type: 'count_vote',
    by: 'steward',
    phases: ['day'],
    handle(ctx, cmd) {
      openDay(ctx.s);
      const x = todaysNominations(ctx.s).find((y) => y.id === cmd.id);
      need(x, 'No such nomination today.');
      const voters = seatOrder(ctx.r, cmd.voters);
      need(voters.length === cmd.voters.length, 'Not a seated player.');
      // A correction first gives back what the last count spent. A token spent since stays spent.
      for (const id of x.vote?.spent ?? []) ctx.r.player(id).life.ghostVoteUsed = false;
      const spent = voters.filter((id) => ctx.s.publicDead.includes(id) && !ctx.r.player(id).life.ghostVoteUsed);
      for (const id of spent) ctx.r.player(id).life.ghostVoteUsed = true;
      x.vote = {
        voters,
        spent,
        needed: x.vote?.needed ?? votesNeeded(ctx.s),
        demon: voters.some((id) => ctx.r.isDemon(id)),
      };
    },
  }),
  defineCommand({
    type: 'make_claim',
    by: 'steward',
    phases: ['day'],
    handle(ctx, cmd) {
      const a = openDay(ctx.s);
      const found = claimsOf(ctx.base).find((x) => x.roleId === cmd.roleId && x.def.claim === cmd.claim);
      need(found, 'That cannot be claimed on this script.');
      const seated = cmd.values.every((id) => ctx.r.isSeated(id));
      need(cmd.values.length === found.def.fields.length && seated, 'Choose the players.');
      ctx.s.gameEnd = [];
      const run = ctx.run();
      for (const x of run.reader.instances) {
        if (x.roleId !== cmd.roleId) continue;
        roleDef(x.roleId).ability.onClaim?.(run.ctx(x), { claim: cmd.claim, values: cmd.values });
      }
      run.commitDay();
      const lines = dayLines(ctx.s, run);
      judgeDay(ctx.s, a, run);
      const said = found.def.says.replace(/\{(\d)\}/g, (_, i: string) => ctx.r.name(cmd.values[Number(i)] ?? null));
      record(ctx.s, a, {
        kind: 'claim',
        text: `${said}.`,
        nomination: null,
        // A bluff, a drunk, a spent ability and a miss must all read the same.
        lines: lines.length || a.over ? lines : ['Nothing happens.'],
      });
    },
  }),
  defineCommand({
    type: 'execute',
    by: 'steward',
    phases: ['day'],
    handle(ctx, cmd) {
      const a = openDay(ctx.s);
      const id = cmd.playerId;
      need(id === null || ctx.r.isSeated(id), 'Not a seated player.');
      const run = ctx.run();
      const asked = executionQuestions(ctx.base).filter((q) => cmd.yes.includes(q.roleId));
      const saved =
        id !== null &&
        run.reader.instances.some(
          (x) =>
            asked.some((q) => q.roleId === x.roleId) && roleDef(x.roleId).ability.survivesExecution?.(run.ctx(x), id),
        );
      run.recordExecution(id, id !== null && !saved);
      record(ctx.s, a, { kind: 'execution', text: '', nomination: null, lines: closeDay(ctx, a) });
    },
  }),
  defineCommand({
    type: 'begin_night',
    by: 'steward',
    phases: ['day'],
    handle(ctx) {
      const a = live(ctx.s);
      need(a.dayClosed, 'Record the execution first, or that there was none.');
      a.dayClosed = false;
      nightfall(ctx);
    },
  }),
  defineCommand({
    type: 'announce_end',
    by: 'steward',
    phases: playing,
    handle(ctx) {
      const over = ctx.s.autoplay?.over;
      need(over, 'The game is not over.');
      ctx.s.phase = { kind: 'ended', reason: 'steward', winner: over.winner };
    },
  }),
  defineCommand({
    type: 'set_away',
    by: 'steward',
    phases: playing,
    handle(ctx, cmd) {
      const a = live(ctx.s);
      need(ctx.r.isSeated(cmd.playerId), 'Not a seated player.');
      const others = a.away.filter((id) => id !== cmd.playerId);
      a.away = cmd.away ? [...others, cmd.playerId] : others;
    },
  }),
  defineCommand({
    type: 'hand_steward',
    by: 'steward',
    phases: ALL_PHASES,
    handle(ctx, cmd) {
      need(ctx.s.players.has(cmd.playerId) && cmd.playerId !== ctx.s.stewardId, 'Choose another player.');
      const before = ctx.s.phase.kind === 'lobby' || ctx.s.phase.kind === 'setup';
      need(before || ctx.r.isSeated(cmd.playerId), 'The steward plays too, so choose a seated player.');
      ctx.s.stewardId = cmd.playerId;
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'offer_storyteller',
    by: 'steward',
    phases: playing,
    handle(ctx, cmd) {
      const a = live(ctx.s);
      need(cmd.playerId === null || ctx.s.players.has(cmd.playerId), 'No such player.');
      a.offered = cmd.playerId;
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'accept_storyteller',
    by: 'player',
    phases: playing,
    handle(ctx) {
      const s = ctx.s;
      need(isAutoplay(s), 'You cannot do that now.');
      const a = live(s);
      need(a.offered !== null && a.offered === ctx.actor, 'You cannot do that now.');
      a.offered = null;
      a.handedTo = ctx.actor;
      // One way. They keep their seat and character, as taking them out would show what they were.
      s.storytellerId = ctx.actor;
      s.stewardId = null;
      s.gameEnd = [];
    },
  }),
  defineCommand({
    type: 'abandon',
    by: 'steward',
    phases: playing,
    handle(ctx) {
      ctx.s.phase = { kind: 'ended', reason: 'steward', winner: null };
    },
  }),
  defineCommand({ type: 'steward_play_again', by: 'steward', phases: ['ended'], handle: (ctx) => playAgain(ctx) }),
  defineCommand({
    type: 'steward_new_game',
    by: 'steward',
    phases: ['lobby', 'setup', 'ended'],
    handle: (ctx) => newGame(ctx),
  }),
  defineCommand({
    type: 'answer_day_prompt',
    by: 'player',
    phases: ['day'],
    handle(ctx, cmd) {
      const refusal = 'You cannot do that now.';
      need(isAutoplay(ctx.s) && ctx.actor, refusal);
      openDay(ctx.s);
      const run = ctx.run();
      const found = dayPrompts(run, ctx.actor).find((x) => x.spec.key === cmd.key);
      need(found, refusal);
      const error = dayValuesError(found.spec, found.d, cmd.values);
      need(!error, error ?? '');
      roleDef(found.a.roleId).ability.applyDayAction?.(run.ctx(found.a), found.d.action, cmd.values, 'none');
    },
  }),
  defineCommand({
    type: 'auto_close',
    by: 'system',
    phases: ['night'],
    handle(ctx) {
      const a = live(ctx.s);
      const p = ctx.phase;
      need(isAutoplay(ctx.s) && p.stage === 'collecting' && !notDone(ctx.base).length, 'Not yet.');
      a.awayTonight = ctx.r.seated.filter((id) => a.away.includes(id));
      for (const id of a.awayTonight) if (!p.submissions.has(id)) skip(ctx, id);
      p.stage = 'review';
      a.closedAt = ctx.now;
    },
  }),
  defineCommand({
    type: 'auto_answer',
    by: 'system',
    phases: ['night'],
    handle(ctx) {
      const a = live(ctx.s);
      need(isAutoplay(ctx.s) && ctx.phase.stage === 'review', 'Not yet.');
      answerFor(ctx, (id) => a.awayTonight.includes(id));
    },
  }),
];
