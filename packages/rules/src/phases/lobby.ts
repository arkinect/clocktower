import type { PlayerId } from '@ct/protocol';
import type { GameState, Player } from '../model/state';
import { SETUP_MOMENT } from '../model/state';
import { ALL_PHASES, defineCommand, need } from './define';

/** Control characters out, spaces collapsed; null when not a usable name. */
export function cleanName(raw: string): string | null {
  const printable = [...raw].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('');
  const n = printable.replace(/\s+/g, ' ').trim();
  return n && n.length <= 24 ? n : null;
}

const nameTaken = (s: GameState, name: string, except?: PlayerId) =>
  Object.values(s.players).some((p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase());

export function newPlayer(id: PlayerId, name: string, rolePreference: Player['rolePreference'], now: number): Player {
  return {
    id,
    name,
    rolePreference,
    joinedAt: now,
    hasSeenRole: false,
    life: { alive: true, diedAt: null, cause: null, ghostVoteUsed: false },
    removal: null,
    character: null,
    alignment: 'good',
    self: { character: null, alignment: 'good' },
    history: [],
  };
}

export function seatPlayers(s: GameState, order: readonly PlayerId[]) {
  s.seats = order.map((playerId) => ({ playerId, joined: SETUP_MOMENT, left: null }));
}

const inSetup = ['lobby', 'setup'] as const;

export const lobbyCommands = [
  defineCommand({
    type: 'join',
    by: 'system',
    phases: ALL_PHASES,
    handle(ctx, cmd) {
      const name = cleanName(cmd.name);
      need(name, 'Enter a name of 1 to 24 characters.');
      need(!nameTaken(ctx.s, name), 'That name is already taken. If it is you, use "I\'m already in this game".');
      need(!ctx.s.players[cmd.id], 'That player already exists.');
      ctx.s.players[cmd.id] = newPlayer(cmd.id, name, cmd.rolePreference, ctx.now);
      if (cmd.wantsStoryteller && !ctx.s.storytellerId) ctx.s.storytellerId = cmd.id;
      ctx.reply({ playerId: cmd.id, isStoryteller: ctx.s.storytellerId === cmd.id });
    },
  }),
  defineCommand({
    type: 'claim_storyteller',
    by: 'player',
    phases: ALL_PHASES,
    handle(ctx) {
      need(!ctx.s.storytellerId, 'There is already a Storyteller.');
      const id = ctx.actor as PlayerId;
      ctx.s.storytellerId = id;
      ctx.s.seats = ctx.s.seats.filter((x) => x.playerId !== id);
    },
  }),
  defineCommand({
    type: 'rename_player',
    by: 'storyteller',
    phases: inSetup,
    handle(ctx, cmd) {
      const p = ctx.s.players[cmd.playerId];
      const name = cleanName(cmd.name);
      need(p && name, 'Invalid name.');
      need(!nameTaken(ctx.s, name, p.id), 'That name is taken.');
      p.name = name;
    },
  }),
  defineCommand({
    type: 'remove_player',
    by: 'storyteller',
    phases: inSetup,
    handle(ctx, cmd) {
      need(cmd.playerId !== ctx.s.storytellerId, 'The Storyteller cannot be removed.');
      need(ctx.s.players[cmd.playerId], 'No such player.');
      const run = ctx.run();
      for (const a of ctx.r.abilitiesOf(cmd.playerId)) run.revoke(a.id);
      delete ctx.s.players[cmd.playerId];
      delete ctx.s.inbox[cmd.playerId];
      delete ctx.s.setup.bag[cmd.playerId];
      ctx.s.abilities = Object.fromEntries(
        Object.entries(ctx.s.abilities).filter(
          ([, a]) => !(a.holder.kind === 'player' && a.holder.id === cmd.playerId),
        ),
      );
      ctx.s.conditions = ctx.s.conditions.filter((c) => c.target !== cmd.playerId);
      ctx.s.seats = ctx.s.seats.filter((x) => x.playerId !== cmd.playerId);
    },
  }),
  defineCommand({
    type: 'open_setup',
    by: 'storyteller',
    phases: ['lobby'],
    handle(ctx) {
      ctx.s.phase = { kind: 'setup' };
      const seated = ctx.r.seated;
      const rest = Object.values(ctx.s.players)
        .filter((p) => p.id !== ctx.s.storytellerId && !seated.includes(p.id))
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => p.id);
      seatPlayers(ctx.s, [...seated, ...rest]);
    },
  }),
];
