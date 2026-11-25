import type { PlayerId } from '@ct/protocol';
import type { GameState, Phase, Player } from '../model/state';
import { SETUP_MOMENT } from '../model/state';
import { ALL_PHASES, defineCommand, need, type CmdCtx } from './define';

/** The longest name a player may have. The server cuts a longer one down to this before it gets here. */
export const NAME_MAX = 24;

/** Control characters out, spaces collapsed; null when not a usable name. */
export function cleanName(raw: string): string | null {
  const printable = [...raw].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('');
  const n = printable.replace(/\s+/g, ' ').trim();
  return n && n.length <= NAME_MAX ? n : null;
}

const nameTaken = (s: GameState, name: string, except?: PlayerId) =>
  [...s.players.values()].some((p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase());

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

/** Anything with the game draft and what reads it: a command's context, whatever its phases. */
type Ctx = Pick<CmdCtx<Phase['kind']>, 's' | 'r' | 'run'>;

export function renamePlayer(ctx: Ctx, id: PlayerId, raw: string) {
  const p = ctx.s.players.get(id);
  const name = cleanName(raw);
  need(p && name, 'Invalid name.');
  need(!nameTaken(ctx.s, name, p.id), 'That name is taken.');
  p.name = name;
}

export function removePlayer(ctx: Ctx, id: PlayerId) {
  need(ctx.s.players.has(id), 'No such player.');
  const run = ctx.run();
  for (const a of ctx.r.abilitiesOf(id)) run.revoke(a.id);
  ctx.s.players.delete(id);
  ctx.s.inbox.delete(id);
  ctx.s.setup.bag.delete(id);
  ctx.s.abilities = new Map(
    [...ctx.s.abilities.entries()].filter(([, a]) => !(a.holder.kind === 'player' && a.holder.id === id)),
  );
  ctx.s.conditions = ctx.s.conditions.filter((c) => c.target !== id);
  ctx.s.seats = ctx.s.seats.filter((x) => x.playerId !== id);
}

/** Seats everyone who is not the Storyteller, in the order they joined. */
export function openSetup(ctx: Ctx) {
  ctx.s.phase = { kind: 'setup' };
  const seated = ctx.r.seated;
  const rest = [...ctx.s.players.values()]
    .filter((p) => p.id !== ctx.s.storytellerId && !seated.includes(p.id))
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => p.id);
  seatPlayers(ctx.s, [...seated, ...rest]);
}

const inSetup = ['lobby', 'setup'] as const;

export const lobbyCommands = [
  defineCommand({
    type: 'join',
    by: 'system',
    phases: ALL_PHASES,
    handle(ctx, cmd) {
      const name = cleanName(cmd.name);
      need(name, `Enter a name of 1 to ${NAME_MAX} characters.`);
      need(!nameTaken(ctx.s, name), 'That name is already taken. If it is you, use "I\'m already in this game".');
      need(!ctx.s.players.has(cmd.id), 'That player already exists.');
      ctx.s.players.set(cmd.id, newPlayer(cmd.id, name, cmd.rolePreference, ctx.now));
      if (cmd.wantsStoryteller && !ctx.s.storytellerId && !ctx.s.stewardId) ctx.s.storytellerId = cmd.id;
      // Opening setup seats everyone in the lobby. Someone who joins after that takes the next seat, as they would
      // have then: the console has no other way to seat one player. Once the game has started, a joiner only watches.
      if (ctx.s.phase.kind === 'setup' && ctx.s.storytellerId !== cmd.id) {
        ctx.s.seats.push({ playerId: cmd.id, joined: SETUP_MOMENT, left: null });
      }
      ctx.reply({ playerId: cmd.id, isStoryteller: ctx.s.storytellerId === cmd.id });
    },
  }),
  defineCommand({
    type: 'claim_storyteller',
    by: 'player',
    phases: ALL_PHASES,
    handle(ctx) {
      need(!ctx.s.storytellerId && !ctx.s.stewardId, 'There is already a Storyteller.');
      const id = ctx.actor as PlayerId;
      ctx.s.storytellerId = id;
      ctx.s.seats = ctx.s.seats.filter((x) => x.playerId !== id);
    },
  }),
  defineCommand({
    type: 'rename_player',
    by: 'storyteller',
    phases: inSetup,
    handle: (ctx, cmd) => renamePlayer(ctx, cmd.playerId, cmd.name),
  }),
  defineCommand({
    type: 'remove_player',
    by: 'storyteller',
    phases: inSetup,
    handle(ctx, cmd) {
      need(cmd.playerId !== ctx.s.storytellerId, 'The Storyteller cannot be removed.');
      removePlayer(ctx, cmd.playerId);
    },
  }),
  defineCommand({
    type: 'open_setup',
    by: 'storyteller',
    phases: ['lobby'],
    handle: openSetup,
  }),
];
