import { clone } from '../util/clone';
import type { PlayerId, RoleId } from '@ct/protocol';
import { roleDef } from '../abilities/registry';
import type { DayEventInfo, Instance } from '../abilities/define';
import type { GameState } from '../model/state';
import type { Run } from '../night/run';
import { validateChoice } from '../night/wake';
import { ALL_PHASES, defineCommand, need } from './define';
import { createGame } from '../model/create';

/** Day events fire every active ability's onDayEvent, then the game-end check. */
export function fireDayEvent(run: Run, event: DayEventInfo) {
  for (const a of run.reader.instances) roleDef(a.roleId).ability.onDayEvent?.(run.ctx(a), event);
}

/**
 * The end of the day's execution, run at dusk: what the day's final record means for other characters (the Cannibal,
 * the Mastermind, the Mayor). No record counts as no execution. A player who isn't dead by this execution now (revived,
 * or saved) gives `died: false`.
 */
export function fireExecutionAtDusk(run: Run, n: number) {
  const record = run.world.events.findLast((e) => e.kind === 'execution' && e.at.kind === 'day' && e.at.n === n);
  const id = record?.kind === 'execution' ? record.playerId : null;
  const life = id ? run.reader.player(id).life : null;
  const died =
    !!life && !life.alive && life.cause === 'execution' && life.diedAt?.kind === 'day' && life.diedAt.n === n;
  const demonDiedAliveBefore = died && id && run.reader.isDemon(id) ? run.reader.aliveResidents.length + 1 : null;
  fireDayEvent(run, { kind: 'execution', playerId: id, died, demonDiedAliveBefore });
}

/** The day specs of an ability, built fresh: legality always comes from the hook. */
function dayActionsOf(run: Run, a: Instance) {
  return roleDef(a.roleId).ability.dayActions?.(run.ctx(a)) ?? [];
}

export const dayCommands = [
  defineCommand({
    type: 'seen_role',
    by: 'player',
    phases: ALL_PHASES,
    handle(ctx) {
      ctx.s.players[ctx.actor as PlayerId]!.hasSeenRole = true;
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'use_ghost_vote',
    by: 'player',
    phases: ['night', 'day'],
    handle(ctx) {
      const me = ctx.s.players[ctx.actor as PlayerId]!;
      need(ctx.r.isSeated(me.id) && !me.life.alive, 'Only dead players have a ghost vote.');
      me.life.ghostVoteUsed = true;
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'set_ghost_vote',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      const p = ctx.s.players[cmd.playerId];
      need(p && ctx.r.isSeated(cmd.playerId), 'Not a seated player.');
      need(!p.life.alive, 'Only dead players have a ghost vote to use.');
      p.life.ghostVoteUsed = cmd.used;
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'mark_alive',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      need(ctx.r.isSeated(cmd.playerId), 'Not a seated player.');
      const alive = ctx.r.isAlive(cmd.playerId);
      if (alive === cmd.alive) return;
      const run = ctx.run();
      if (cmd.alive) run.revive(cmd.playerId, 'the Storyteller');
      else run.kill(cmd.playerId, 'storyteller');
      if (ctx.s.phase.kind === 'day') run.commitDay();
    },
  }),
  // Not sent by the console since 0.5.1. Kept for saved games, tests and future roles.
  defineCommand({
    type: 'record_nomination',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      need(cmd.nominator === null || ctx.r.isSeated(cmd.nominator), 'Not a seated player.');
      need(ctx.r.isSeated(cmd.nominee), 'Not a seated player.');
      ctx.s.events.push({ kind: 'nomination', at: ctx.moment, nominator: cmd.nominator, nominee: cmd.nominee });
      const run = ctx.run();
      fireDayEvent(run, { kind: 'nomination', nominator: cmd.nominator, nominee: cmd.nominee });
      run.commitDay();
    },
  }),
  defineCommand({
    type: 'record_vote',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      need(ctx.r.isSeated(cmd.nominee), 'Not a seated player.');
      const { nominee, voters } = cmd;
      const run = ctx.run();
      let count = cmd.count;
      for (const a of run.reader.instances) {
        const hook = roleDef(a.roleId).ability.adjustVote;
        count = hook?.(run.ctx(a), { nominee, voters, count }) ?? count;
      }
      ctx.s.events.push({ kind: 'vote', at: ctx.moment, nominee, count, voters });
      fireDayEvent(run, { kind: 'vote', nominee, count, voters });
      run.commitDay();
    },
  }),
  defineCommand({
    type: 'record_execution',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      const id = cmd.playerId;
      if (id !== null) need(ctx.r.isSeated(id), 'Not a seated player.');
      // Today's execution is one record: a new one replaces it. What it triggers for other characters waits for
      // dusk (start_night), so a Storyteller revive before then undoes it. An earlier player stays dead.
      const run = ctx.run();
      run.recordExecution(id, cmd.died);
      if (id && cmd.died && ctx.r.isAlive(id)) run.kill(id, 'execution');
      run.commitDay();
    },
  }),
  defineCommand({
    type: 'record_statement',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      need(ctx.r.isSeated(cmd.playerId), 'Not a seated player.');
      ctx.s.events.push({ kind: 'statement', at: ctx.moment, playerId: cmd.playerId, text: cmd.text });
      const run = ctx.run();
      fireDayEvent(run, { kind: 'statement', playerId: cmd.playerId, text: cmd.text });
      run.commitDay();
    },
  }),
  defineCommand({
    type: 'record_broke_madness',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      need(
        ctx.s.conditions.some((c) => c.type === 'mad' && c.target === cmd.playerId),
        'That player is not mad.',
      );
      ctx.s.events.push({ kind: 'broke_madness', at: ctx.moment, playerId: cmd.playerId, ruling: cmd.ruling });
    },
  }),
  defineCommand({
    type: 'set_notes',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      ctx.s.events = ctx.s.events.filter((e) => !(e.kind === 'note' && e.at.kind === 'day' && e.at.n === ctx.phase.n));
      ctx.s.events.push({ kind: 'note', at: ctx.moment, text: cmd.text });
    },
  }),
  defineCommand({
    type: 'day_action',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      const preview = cmd.mode === 'preview';
      const world = preview ? clone(ctx.s) : ctx.s;
      const run = ctx.run({ world, ...(cmd.decisions ? { decisions: cmd.decisions } : {}) });
      const a = world.abilities[cmd.abilityId];
      need(a && run.reader.isActive(a), 'That ability is not in play.');
      const hook = roleDef(a.roleId).ability.applyDayAction;
      const spec = dayActionsOf(run, a).find((d) => d.action === cmd.action);
      need(hook && spec, 'That action is not available.');
      const error = validateChoice(run.fullSpec(a, cmd.action, spec), { values: cmd.values });
      need(!error, error ?? '');
      const force = cmd.mode === 'force_success' ? 'success' : cmd.mode === 'force_fail' ? 'fail' : 'none';
      const outcome = hook(run.ctx(a), cmd.action, cmd.values, force);
      if (!preview) run.commitDay();
      ctx.reply({ ...outcome, decisions: [...run.decisions.values()], preview });
    },
  }),
  defineCommand({
    type: 'resolve_prompt',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      const q = ctx.s.prompts.find((x) => x.id === cmd.id);
      need(q, 'Already handled.');
      need(
        q.options.some((o) => o.id === cmd.option),
        'That option is not available.',
      );
      ctx.s.prompts = ctx.s.prompts.filter((x) => x.id !== cmd.id);
      const a = ctx.s.abilities[q.ability];
      if (!a) return;
      const run = ctx.run();
      roleDef(a.roleId).ability.onPrompt?.(run.ctx(a), q.kind, q.subject, cmd.option);
      if (ctx.s.phase.kind === 'day') run.commitDay();
    },
  }),
  defineCommand({
    type: 'set_ability_used',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      const a = ctx.s.abilities[cmd.abilityId];
      need(a, 'No such ability.');
      a.used = cmd.used;
    },
  }),
  defineCommand({
    type: 'add_condition',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      need(ctx.r.isSeated(cmd.target), 'Not a seated player.');
      ctx.s.conditions.push({
        id: `c${ctx.s.idSeq++}` as GameState['conditions'][number]['id'],
        type: cmd.condition,
        target: cmd.target,
        source: { kind: 'storyteller' },
        until: cmd.condition === 'mad' ? 'removed' : 'dusk',
        since: ctx.moment,
      });
    },
  }),
  defineCommand({
    type: 'remove_condition',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      ctx.s.conditions = ctx.s.conditions.filter((c) => c.id !== cmd.conditionId);
    },
  }),
  defineCommand({
    type: 'add_traveller',
    by: 'storyteller',
    phases: ['setup', 'night', 'day'],
    handle(ctx, cmd) {
      const p = ctx.s.players[cmd.playerId];
      need(p, 'No such player.');
      need(cmd.playerId !== ctx.s.storytellerId, 'The Storyteller cannot be a Traveller.');
      need(!ctx.r.isSeated(cmd.playerId), 'That player is already seated.');
      need(roleDef(cmd.roleId).type === 'traveller', 'That character is not a Traveller.');
      ctx.s.seats.push({ playerId: cmd.playerId, joined: ctx.moment, left: null });
      const run = ctx.run();
      run.changeCharacter(cmd.playerId, cmd.roleId, { reason: 'joined as a Traveller', keepGranted: false });
      p.alignment = cmd.alignment;
      p.self.alignment = cmd.alignment;
      if (ctx.s.phase.kind !== 'setup' && cmd.alignment === 'evil') {
        const demons = run.reader.demons.map(run.reader.name).join(', ');
        run.deliver(cmd.playerId, 'notice', 'The Demon', [`The Demon is: ${demons}.`]);
      }
      if (!ctx.s.publishedSeating.includes(cmd.playerId)) ctx.s.publishedSeating.push(cmd.playerId);
    },
  }),
  defineCommand({
    type: 'exile_traveller',
    by: 'storyteller',
    phases: ['day'],
    handle(ctx, cmd) {
      need(ctx.r.typeOf(cmd.playerId) === 'traveller', 'Only a Traveller can be exiled.');
      const p = ctx.s.players[cmd.playerId]!;
      p.removal = { kind: 'exiled', at: ctx.moment };
      ctx.s.events.push({ kind: 'exile', at: ctx.moment, playerId: cmd.playerId });
      const run = ctx.run();
      if (p.life.alive) run.kill(cmd.playerId, 'exile');
      fireDayEvent(run, { kind: 'exile', playerId: cmd.playerId });
      run.commitDay();
    },
  }),
  defineCommand({
    type: 'remove_traveller',
    by: 'storyteller',
    phases: ['setup', 'night', 'day'],
    handle(ctx, cmd) {
      need(ctx.r.typeOf(cmd.playerId) === 'traveller', 'Only a Traveller can leave.');
      const p = ctx.s.players[cmd.playerId]!;
      p.removal = { kind: 'left', at: ctx.moment };
      const seat = ctx.s.seats.find((x) => x.playerId === cmd.playerId && x.left === null);
      if (seat) seat.left = ctx.moment;
      const run = ctx.run();
      for (const a of ctx.r.abilitiesOf(cmd.playerId)) run.revoke(a.id);
    },
  }),
  defineCommand({
    type: 'confirm_game_end',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      const g = ctx.s.gameEnd.find((x) => x.key === cmd.key);
      need(g, 'No such suggestion.');
      ctx.s.phase = { kind: 'ended', reason: 'storyteller', winner: g.winner };
      ctx.s.gameEnd = [];
    },
  }),
  defineCommand({
    type: 'dismiss_game_end',
    by: 'storyteller',
    phases: ['night', 'day'],
    handle(ctx, cmd) {
      ctx.s.gameEnd = ctx.s.gameEnd.filter((x) => x.key !== cmd.key);
      if (!ctx.s.dismissedGameEnd.includes(cmd.key)) ctx.s.dismissedGameEnd.push(cmd.key);
      ctx.keepResolution();
    },
  }),
  defineCommand({
    type: 'end_game',
    by: 'storyteller',
    phases: ['setup', 'night', 'day'],
    handle(ctx, cmd) {
      ctx.s.phase = { kind: 'ended', reason: 'storyteller', winner: cmd.winner ?? null };
    },
  }),
  defineCommand({
    type: 'play_again',
    by: 'storyteller',
    phases: ['night', 'day', 'ended'],
    handle(ctx) {
      const s = ctx.s;
      const next = createGame(s.code, s.createdAt);
      next.id = s.id;
      next.seq = s.seq;
      next.idSeq = s.idSeq;
      next.storytellerId = s.storytellerId;
      next.script = [...s.script];
      next.settings = { ...s.settings };
      next.seatingPublished = s.seatingPublished;
      next.publishedSeating = s.publishedSeating.filter((id) => s.seats.some((x) => x.playerId === id && !x.left));
      next.seats = s.seats.filter((x) => x.left === null && ctx.r.typeOf(x.playerId) !== 'traveller');
      for (const [id, p] of Object.entries(s.players)) {
        next.players[id] = {
          ...p,
          hasSeenRole: false,
          life: { alive: true, diedAt: null, cause: null, ghostVoteUsed: false },
          removal: null,
          character: null,
          alignment: 'good',
          self: { character: null, alignment: 'good' },
          history: [],
        };
      }
      next.phase = { kind: 'setup' };
      Object.assign(s, next);
    },
  }),
  defineCommand({
    type: 'force_phase',
    by: 'storyteller',
    phases: ALL_PHASES,
    handle(ctx, cmd) {
      if (cmd.phase === 'day') {
        const p = ctx.s.phase;
        need(p.kind === 'night' || p.kind === 'day', 'Begin the first night first.');
        if (p.kind === 'night') ctx.s.phase = { kind: 'day', n: p.n + 1 };
      } else if (cmd.phase === 'ended') {
        ctx.s.phase = { kind: 'ended', reason: 'storyteller', winner: null };
      } else {
        ctx.s.phase = { kind: cmd.phase };
      }
    },
  }),
];

export type { RoleId };
