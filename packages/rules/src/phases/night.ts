import { clone } from '../util/clone';
import type { PlayerId } from '@ct/protocol';
import { roleDef } from '../abilities/registry';
import { computeImpairment } from '../derive/impairment';
import type { GameState, NightPhase, StoryRow } from '../model/state';
import { Run, hashDecision, type Resolution } from '../night/run';
import { newNightPhase } from '../night/phase';
import { actionSpecs, expectedActors, resolveNight, validateChoice, validateSubmission } from '../night/wake';
import { fireExecutionAtDusk } from './day';
import { defineCommand, need, type CmdCtx } from './define';

/** The first time this night has follow-up questions, whatever brought them, the countdown gets more time. */
function extendForFollowUps(ctx: CmdCtx<'night'>) {
  const p = ctx.phase;
  if (p.stage !== 'review' || p.followUpsExtended) return;
  if (!resolveNight(clone(ctx.s)).questions.length) return;
  p.followUpsExtended = true;
  p.deadline = Math.max(p.deadline ?? ctx.now, ctx.now) + ctx.s.settings.followUpExtensionSeconds * 1000;
}

const collecting = (p: NightPhase) => p.stage === 'collecting' || p.stage === 'briefing';

function nightStory(s: GameState, res: Resolution, n: number): StoryRow[] {
  const end = computeImpairment(res.after, { kind: 'night', n });
  return s.seats
    .filter((x) => x.left === null)
    .map(({ playerId: pid }) => {
      const p = s.players[pid]!;
      const rows = res.actors.filter((r) => r.playerId === pid);
      const causes = new Set(rows.flatMap((r) => r.causes));
      for (const c of end[pid]?.causes ?? []) causes.add(c);
      return {
        playerId: pid,
        name: p.name,
        character: p.character,
        believed: s.setup.bag[pid] ?? null,
        alignment: p.alignment,
        aliveAtStart: p.life.alive,
        aliveAtEnd: !!res.after.players[pid]?.life.alive,
        impaired: causes.size > 0,
        causes: [...causes],
        actions: rows.map((r) => ({ slot: r.slot, input: r.input, outcome: r.outcome })),
        received: [
          ...res.results
            .filter((r) => r.playerId === pid)
            .map((r) => ({
              title: r.title,
              lines: r.final,
              truth: r.final.join('\n') !== r.truth.join('\n') ? r.truth : null,
            })),
          ...res.notices
            .filter((x) => x.playerId === pid)
            .map((x) => ({ title: x.title, lines: x.lines, truth: null })),
        ],
      };
    });
}

const appearsDead = (run: Run, id: PlayerId) =>
  run.reader.abilitiesOf(id).some((a) => roleDef(a.roleId).ability.appearsDead?.(run.ctx(a)));

/** One atomic step that commits the night and sends everyone to the day. */
function publish(s: GameState, res: Resolution, n: number, seed: number, now: number) {
  const before = new Set(s.seats.map((x) => x.playerId).filter((id) => s.players[id]?.life.alive));
  const rows = nightStory(s, res, n);
  const after = res.after;
  s.players = clone(after.players);
  s.abilities = clone(after.abilities);
  s.conditions = clone(after.conditions);
  s.seats = clone(after.seats);
  s.setup = clone(after.setup);
  s.idSeq = after.idSeq;
  s.events.push({ kind: 'night_record', at: { kind: 'night', n }, rows, deaths: res.deaths, revived: res.revived });
  for (const pid of res.deaths) {
    s.events.push({
      kind: 'death',
      at: { kind: 'night', n },
      playerId: pid,
      cause: s.players[pid]?.life.cause ?? 'unknown',
    });
  }
  const day = { kind: 'day' as const, n: n + 1 };
  s.phase = { kind: 'day', n: n + 1 };
  const run = new Run({ world: s, moment: day, seed, now });
  const say = (pid: PlayerId, kind: 'result' | 'notice', title: string, lines: string[]) =>
    run.deliver(pid, kind, title, lines);
  const told = new Set<PlayerId>();
  for (const r of res.results) {
    say(r.playerId, 'result', r.title, r.final);
    told.add(r.playerId);
  }
  for (const x of res.notices) say(x.playerId, 'notice', x.title, x.lines);
  for (const pid of res.deaths) {
    if (!s.players[pid]?.life.alive && before.has(pid)) say(pid, 'notice', 'You have died', ['You died in the night.']);
  }
  for (const pid of res.revived) {
    if (s.players[pid]?.life.alive) say(pid, 'notice', 'You are alive again', ['You have been brought back to life.']);
  }
  for (const a of run.reader.instances) roleDef(a.roleId).ability.onPublish?.(run.ctx(a));
  for (const pid of run.reader.seated) {
    if (!told.has(pid)) say(pid, 'result', 'Tonight', ['You learned nothing.']);
  }
  s.publicDead = run.reader.seated.filter((id) => !run.reader.isAlive(id) || appearsDead(run, id));
  for (const g of res.gameEnd) {
    if (!s.dismissedGameEnd.includes(g.key) && !s.gameEnd.some((x) => x.key === g.key)) s.gameEnd.push(g);
  }
  run.commitDay();
}

export const nightCommands = [
  defineCommand({
    type: 'open_collecting',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx) {
      need(ctx.phase.stage === 'briefing', 'Collecting is already open.');
      ctx.phase.stage = 'collecting';
      ctx.phase.deadline = ctx.now + ctx.s.settings.countdownSeconds * 1000;
    },
  }),
  defineCommand({
    type: 'close_collecting',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      const p = ctx.phase;
      need(p.stage !== 'review', 'Collecting is already closed.');
      if (!cmd.force) {
        need(p.stage === 'collecting', 'Collecting has not started.');
        const pending = expectedActors(ctx.base).filter((id) => !p.submissions[id]);
        const timeUp = p.deadline !== null && ctx.now >= p.deadline;
        need(!pending.length || timeUp, `Waiting for ${pending.length} player(s). Wait for the countdown or force.`);
      }
      p.stage = 'review';
      extendForFollowUps(ctx);
    },
  }),
  defineCommand({
    type: 'reopen_collecting',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx) {
      need(ctx.phase.stage === 'review', 'Not in review.');
      ctx.phase.stage = 'collecting';
      ctx.phase.answers = {};
    },
  }),
  defineCommand({
    type: 'extend_countdown',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      ctx.phase.deadline = Math.max(ctx.phase.deadline ?? ctx.now, ctx.now) + cmd.seconds * 1000;
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'set_countdown',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      ctx.s.settings.countdownSeconds = cmd.seconds;
      if (ctx.phase.stage === 'collecting') ctx.phase.deadline = ctx.now + cmd.seconds * 1000;
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'submit_night',
    by: 'player',
    phases: ['night'],
    handle(ctx, cmd) {
      const me = ctx.actor as PlayerId;
      need(ctx.phase.stage === 'collecting', 'The night is not collecting choices right now.');
      need(ctx.r.isSeated(me), 'You are not seated in this game.');
      const specs = actionSpecs(ctx.base, me);
      // A player with nothing to do gets the same response as a real submission.
      const v = specs.length ? validateSubmission(ctx.base, me, cmd.actions) : { ok: true as const, actions: {} };
      need(v.ok, v.ok ? '' : v.error);
      ctx.phase.submissions[me] = { actions: v.actions, at: ctx.now, byStoryteller: false };
    },
  }),
  defineCommand({
    type: 'submit_for',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      need(collecting(ctx.phase), 'Not collecting.');
      need(ctx.r.isSeated(cmd.playerId), 'Not a seated player.');
      const v = validateSubmission(ctx.base, cmd.playerId, cmd.actions, true);
      need(v.ok, v.ok ? '' : v.error);
      ctx.phase.submissions[cmd.playerId] = { actions: v.actions, at: ctx.now, byStoryteller: true };
    },
  }),
  defineCommand({
    type: 'mark_no_action',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      need(collecting(ctx.phase), 'Not collecting.');
      need(ctx.r.isSeated(cmd.playerId), 'Not a seated player.');
      const actions = Object.fromEntries(
        actionSpecs(ctx.base, cmd.playerId).map((sp) => [sp.key, { decline: true, values: [] }]),
      );
      ctx.phase.submissions[cmd.playerId] = { actions, at: ctx.now, byStoryteller: true };
    },
  }),
  defineCommand({
    type: 'clear_submission',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      need(collecting(ctx.phase), 'Not collecting.');
      delete ctx.phase.submissions[cmd.playerId];
    },
  }),
  defineCommand({
    type: 'decide',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      const hash = hashDecision(ctx.phase.n, cmd.key);
      if (cmd.option === null) delete ctx.phase.decisions[hash];
      else ctx.phase.decisions[hash] = { key: cmd.key, option: cmd.option };
      extendForFollowUps(ctx);
    },
  }),
  defineCommand({
    type: 'accept_all_defaults',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx) {
      need(ctx.phase.stage === 'review', 'Not in review.');
      // Records the defaults the current resolution asks. A later choice re-runs the night as usual.
      for (const d of resolveNight(ctx.base).decisions) {
        // A required decision is a fact the day didn't record: only the Storyteller can answer it.
        if (d.chosen === null && !d.stale && !d.required) {
          ctx.phase.decisions[d.hash] = { key: d.key, option: d.default };
        }
      }
      extendForFollowUps(ctx);
    },
  }),
  defineCommand({
    type: 'override_result',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      need(ctx.phase.stage === 'review', 'Not in review.');
      if (cmd.lines === null) {
        delete ctx.phase.overrides[cmd.resultKey];
        return;
      }
      const row = resolveNight(ctx.base).results.find((r) => r.key === cmd.resultKey);
      need(row, 'No such result.');
      ctx.phase.overrides[cmd.resultKey] = { lines: cmd.lines, writtenAgainst: row.truth };
    },
  }),
  defineCommand({
    type: 'adjust_malfunctions',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      need(ctx.phase.stage === 'review', 'Not in review.');
      ctx.phase.malfunctionAdjust = {
        add: cmd.add.filter((id) => ctx.r.isSeated(id)),
        remove: cmd.remove.filter((id) => ctx.r.isSeated(id)),
      };
      extendForFollowUps(ctx);
    },
  }),
  defineCommand({
    type: 'answer_question',
    by: 'player',
    phases: ['night'],
    handle(ctx, cmd) {
      need(ctx.phase.stage === 'review', 'You cannot do that now.');
      const q = resolveNight(ctx.base).questions.find((x) => x.key === cmd.key && !x.answered);
      need(q && q.playerId === ctx.actor, 'You cannot do that now.');
      const error = validateChoice(q.spec, cmd.choice);
      need(!error, error ?? '');
      ctx.phase.answers[q.key] = { choice: cmd.choice, byStoryteller: false, at: ctx.now };
    },
  }),
  defineCommand({
    type: 'answer_question_for',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      need(ctx.phase.stage === 'review', 'Not in review.');
      const q = resolveNight(ctx.base).questions.find((x) => x.key === cmd.key);
      need(q, 'No such question.');
      const error = validateChoice(q.spec, cmd.choice);
      need(!error, error ?? '');
      ctx.phase.answers[q.key] = { choice: cmd.choice, byStoryteller: true, at: ctx.now };
    },
  }),
  defineCommand({
    type: 'publish_dawn',
    by: 'storyteller',
    phases: ['night'],
    handle(ctx, cmd) {
      need(ctx.phase.stage === 'review', 'Not in review.');
      const res = resolveNight(ctx.base);
      need(
        !res.questions.some((q) => !q.answered) || cmd.force,
        'Waiting for an answer to a follow-up question. Answer for them or force.',
      );
      const missing = res.decisions.find((d) => d.required && d.chosen === null && !d.stale);
      need(!missing || cmd.force, `Waiting for a decision: ${missing?.title ?? ''} Answer it or force.`);
      publish(ctx.s, res, ctx.phase.n, ctx.seed, ctx.now);
    },
  }),
  defineCommand({
    type: 'start_night',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx) {
      const s = ctx.s;
      const n = ctx.phase.n;
      // Dusk hooks first, so an heir (the Scarlet Woman) is the Demon before the execution's triggers ask.
      const dusk = ctx.run();
      for (const a of ctx.r.instances) roleDef(a.roleId).ability.onDusk?.(dusk.ctx(a));
      fireExecutionAtDusk(dusk, n);
      dusk.commitDay();
      s.conditions = s.conditions.filter((c) => c.until !== 'dusk');
      const notices = s.pendingNotices;
      s.pendingNotices = [];
      s.phase = newNightPhase(n, ctx.seed, 'collecting', ctx.now + s.settings.countdownSeconds * 1000);
      const run = new Run({ world: s, moment: { kind: 'night', n }, seed: ctx.seed, now: ctx.now });
      for (const x of notices) run.deliver(x.playerId, 'notice', x.title, x.lines);
    },
  }),
];
