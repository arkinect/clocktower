import type { PlayerId, RoleId } from '@ct/protocol';
import { findRole, PLAYER_TYPES, roleDef } from '../abilities/registry';
import type { Counts } from '../abilities/define';
import { deliverEvilInfo } from '../night/evil-info';
import { newNightPhase } from '../night/phase';
import { HookCtx } from '../night/context';
import { believedOptions, bluffCandidates, setupChecklist, suggestBluffs, suggestDistribution } from '../setup/rules';
import { defineCommand, LIVE_PHASES, type CmdCtx, need } from './define';
import { seatPlayers } from './lobby';

const setupish = ['lobby', 'setup'] as const;

function assign(ctx: Pick<CmdCtx<'setup'>, 's' | 'run'>, player: PlayerId, role: RoleId | null) {
  const live = ctx.s.phase.kind === 'night' || ctx.s.phase.kind === 'day';
  ctx.run().changeCharacter(player, role, {
    reason: live ? 'Storyteller reassignment' : 'setup',
    alignment: 'natural',
    keepGranted: false,
  });
  if (!live) {
    // Nothing has happened yet, so an unassigned character leaves no trace.
    for (const a of Object.values(ctx.s.abilities)) if (a.activeUntil === 'removed') delete ctx.s.abilities[a.id];
  }
  if (live && ctx.s.settings.notifyOnRoleChange && role) {
    const def = roleDef(role);
    ctx.run().deliver(player, 'notice', 'Your role has changed', [`You are now the ${def.name}.`, def.abilityText]);
  }
}

export const setupCommands = [
  defineCommand({
    type: 'set_script',
    by: 'storyteller',
    phases: setupish,
    handle(ctx, cmd) {
      need(
        cmd.roleIds.every((r) => findRole(r)),
        'Unknown role.',
      );
      ctx.s.script = [...new Set(cmd.roleIds)];
    },
  }),
  defineCommand({
    type: 'set_storyteller_characters',
    by: 'storyteller',
    phases: ['setup', 'night', 'day'],
    handle(ctx, cmd) {
      const isSt = (r: RoleId) => ['fabled', 'loric'].includes(findRole(r)?.type ?? '');
      need(cmd.roleIds.every(isSt), 'Only Fabled and Loric are held by the Storyteller.');
      const started = ctx.s.phase.kind !== 'setup';
      const loric = (list: RoleId[]) => list.filter((r) => roleDef(r).type === 'loric').sort();
      need(
        !started || loric(ctx.s.storytellerCharacters).join() === loric(cmd.roleIds).join(),
        'Loric are fixed at setup.',
      );
      const run = ctx.run();
      for (const a of ctx.r.instances) {
        if (a.origin.kind === 'storyteller' && !cmd.roleIds.includes(a.roleId)) run.revoke(a.id);
      }
      for (const r of cmd.roleIds) {
        if (ctx.r.instances.some((a) => a.origin.kind === 'storyteller' && a.roleId === r)) continue;
        run.grant({ kind: 'storyteller' }, r, { kind: 'storyteller' });
      }
      ctx.s.storytellerCharacters = [...cmd.roleIds];
    },
  }),
  defineCommand({
    type: 'set_seating',
    by: 'storyteller',
    phases: setupish,
    handle(ctx, cmd) {
      const ids = cmd.order.filter((id) => ctx.s.players[id] && id !== ctx.s.storytellerId);
      need(new Set(ids).size === ids.length, 'Duplicate players in seating.');
      seatPlayers(ctx.s, ids);
    },
  }),
  defineCommand({
    type: 'randomise_seating',
    by: 'storyteller',
    phases: setupish,
    handle(ctx) {
      const ids = Object.keys(ctx.s.players).filter((id) => id !== ctx.s.storytellerId) as PlayerId[];
      seatPlayers(ctx.s, ctx.rng.shuffle(ids));
    },
  }),
  defineCommand({
    type: 'publish_seating',
    by: 'storyteller',
    phases: setupish,
    handle(ctx) {
      ctx.s.seatingPublished = true;
      ctx.s.publishedSeating = ctx.r.seated;
    },
  }),
  defineCommand({
    type: 'assign_character',
    by: 'storyteller',
    phases: LIVE_PHASES,
    handle(ctx, cmd) {
      need(ctx.r.isSeated(cmd.playerId), 'Seat the player first.');
      if (cmd.roleId !== null) {
        need(ctx.r.onScript(cmd.roleId), 'That character is not on the script.');
        need(
          ctx.r.mayDuplicate(cmd.roleId) ||
            !ctx.r.seated.some((id) => id !== cmd.playerId && ctx.r.character(id) === cmd.roleId),
          'That character is already assigned.',
        );
      }
      if (ctx.r.character(cmd.playerId) !== cmd.roleId) assign(ctx, cmd.playerId, cmd.roleId);
    },
  }),
  defineCommand({
    type: 'assign_many',
    by: 'storyteller',
    phases: ['setup'],
    handle(ctx, cmd) {
      const entries = Object.entries(cmd.assignments) as [PlayerId, RoleId][];
      const roles = entries.map(([, r]) => r);
      const single = roles.filter((r) => !ctx.r.mayDuplicate(r));
      need(new Set(single).size === single.length, 'Duplicate characters.');
      need(
        entries.every(([p, r]) => ctx.r.isSeated(p) && ctx.r.onScript(r)),
        'Invalid assignment.',
      );
      const touched = new Set(entries.map(([p]) => p));
      for (const id of ctx.r.seated) {
        const c = ctx.r.character(id);
        if (!touched.has(id) && c && roles.includes(c)) assign(ctx, id, null);
      }
      for (const [p, r] of entries) if (ctx.r.character(p) !== r) assign(ctx, p, r);
    },
  }),
  defineCommand({
    type: 'suggest_distribution',
    by: 'storyteller',
    phases: ['setup'],
    handle(ctx) {
      const sug = suggestDistribution(ctx.base, ctx.rng);
      need(!('error' in sug), 'error' in sug ? (sug.error as string) : '');
      for (const [p, r] of Object.entries(sug) as [PlayerId, RoleId][]) {
        if (ctx.r.character(p) !== r) assign(ctx, p, null);
      }
      for (const [p, r] of Object.entries(sug) as [PlayerId, RoleId][]) {
        if (ctx.r.character(p) !== r) assign(ctx, p, r);
      }
    },
  }),
  defineCommand({
    type: 'set_alignment',
    by: 'storyteller',
    phases: LIVE_PHASES,
    handle(ctx, cmd) {
      const p = ctx.s.players[cmd.playerId];
      need(p?.character, 'Assign a character first.');
      // A Storyteller override during the game goes in the history. No guard may stop it, so not changeAlignment.
      if ((ctx.s.phase.kind === 'night' || ctx.s.phase.kind === 'day') && p.alignment !== cmd.alignment) {
        p.history.push({
          kind: 'alignment',
          at: ctx.moment,
          from: p.alignment,
          to: cmd.alignment,
          reason: 'Storyteller',
        });
      }
      p.alignment = cmd.alignment;
      p.self.alignment = cmd.alignment;
    },
  }),
  defineCommand({
    type: 'set_believed',
    by: 'storyteller',
    phases: LIVE_PHASES,
    handle(ctx, cmd) {
      const c = ctx.r.character(cmd.playerId);
      const rule = c ? roleDef(c).believes : undefined;
      need(rule, 'That character has no believed character.');
      if (cmd.roleId !== null) {
        need(believedOptions(ctx.base, cmd.playerId).includes(cmd.roleId), 'That character cannot be believed.');
      }
      ctx.run().setBelieved(cmd.playerId, cmd.roleId);
      if (ctx.s.phase.kind === 'setup') {
        for (const a of Object.values(ctx.s.abilities)) if (a.activeUntil === 'removed') delete ctx.s.abilities[a.id];
      }
    },
  }),
  defineCommand({
    type: 'set_type_counts',
    by: 'storyteller',
    phases: ['setup'],
    handle(ctx, cmd) {
      if (cmd.counts) {
        const n = ctx.r.seated.length;
        need(cmd.counts.reduce((a, b) => a + b, 0) === n, `Counts must add up to the player count (${n}).`);
      }
      ctx.s.setup.rules.countsOverride = cmd.counts;
    },
  }),
  defineCommand({
    type: 'set_bluffs',
    by: 'storyteller',
    phases: LIVE_PHASES,
    handle(ctx, cmd) {
      need(new Set(cmd.roleIds).size === cmd.roleIds.length, 'Choose up to 3 different roles.');
      const cands = bluffCandidates(ctx.base);
      need(
        cmd.roleIds.every((r) => cands.includes(r)),
        'Bluffs must be enabled good roles that are not in play.',
      );
      ctx.s.setup.bluffs = [...cmd.roleIds];
    },
  }),
  defineCommand({
    type: 'suggest_bluffs',
    by: 'storyteller',
    phases: LIVE_PHASES,
    handle(ctx) {
      const b = suggestBluffs(ctx.base, ctx.rng);
      need(b.length >= 3, 'Not enough good roles out of play for 3 bluffs.');
      ctx.s.setup.bluffs = b;
    },
  }),
  defineCommand({
    type: 'set_setup_field',
    by: 'storyteller',
    phases: LIVE_PHASES,
    handle(ctx, cmd) {
      const a = ctx.s.abilities[cmd.abilityId];
      need(a, 'No such ability.');
      const field = roleDef(a.roleId).setupFields?.find((f) => f.field === cmd.field);
      need(field, 'That role has no such setup choice.');
      if (cmd.value !== null) {
        const value = field.kind === 'text' ? cmd.value.trim() : cmd.value;
        need(value, 'Enter a value.');
        if (field.kind !== 'text') {
          need(
            field.options(ctx.r).some((o) => o.id === value),
            'That choice is not legal.',
          );
        }
        const error = field.validate?.(ctx.r, value);
        need(!error, error ?? '');
      }
      const state = a.state as { setup?: Record<string, string | null> };
      a.state = { ...state, setup: { ...state.setup, [cmd.field]: cmd.value } };
    },
  }),
  defineCommand({
    type: 'suggest_setup_field',
    by: 'storyteller',
    phases: LIVE_PHASES,
    handle(ctx, cmd) {
      const a = ctx.s.abilities[cmd.abilityId];
      need(a, 'No such ability.');
      const field = roleDef(a.roleId).setupFields?.find((f) => f.field === cmd.field);
      need(field?.suggest, 'That choice has no suggestion.');
      const value = field.suggest(ctx.r, ctx.rng.pick);
      need(value, 'Nothing to suggest.');
      const state = a.state as { setup?: Record<string, string | null> };
      a.state = { ...state, setup: { ...state.setup, [cmd.field]: value } };
    },
  }),
  defineCommand({
    type: 'set_settings',
    by: 'storyteller',
    phases: ['lobby', 'setup', 'night', 'day'],
    handle(ctx, cmd) {
      const { type: _type, ...changes } = cmd;
      for (const [k, v] of Object.entries(changes)) {
        if (v !== undefined) (ctx.s.settings as Record<string, unknown>)[k] = v;
      }
      const p = ctx.s.phase;
      if (cmd.countdownSeconds !== undefined && p.kind === 'night' && p.stage === 'collecting') {
        p.deadline = ctx.now + cmd.countdownSeconds * 1000;
      }
    },
  }),
  defineCommand({
    type: 'begin_first_night',
    by: 'storyteller',
    phases: ['setup'],
    handle(ctx, cmd) {
      need(ctx.r.seated.length, 'Nobody is seated.');
      if (!cmd.force) {
        const missing = setupChecklist(ctx.base).filter((c) => c.blocking && !c.done);
        need(!missing.length, `Setup is incomplete: ${missing.map((m) => m.label).join('; ')}`);
        need(ctx.r.scriptOfType('demon').length, 'No Demon is enabled.');
      }
      ctx.s.phase = newNightPhase(0, ctx.seed, 'briefing', null);
      if (!ctx.s.seatingPublished) {
        ctx.s.seatingPublished = true;
        ctx.s.publishedSeating = ctx.r.seated;
      }
      for (const p of Object.values(ctx.s.players)) p.hasSeenRole = false;
      const run = ctx.run({ moment: { kind: 'night', n: 0 } });
      deliverEvilInfo(run);
      for (const a of run.reader.instances) {
        const hook = roleDef(a.roleId).ability.briefing;
        if (hook) hook(run.ctx(a));
      }
    },
  }),
];

/** The field specs the console shows. */
export function setupFields(r: import('../derive/reader').Reader) {
  return r.instances.flatMap((a) => {
    const def = roleDef(a.roleId);
    return (def.setupFields ?? [])
      .filter((f) => f.when?.(r) ?? true)
      .map((f) => {
        const value = new HookCtx(r, a).field(f.field);
        return {
          abilityId: a.id,
          field: f.field,
          title: f.title,
          kind: f.kind,
          options: f.options(r),
          value: f.shown ? f.shown(r, value) : value,
          suggestible: !!f.suggest,
        };
      });
  });
}

export type { Counts };
export const playerTypes = PLAYER_TYPES;
