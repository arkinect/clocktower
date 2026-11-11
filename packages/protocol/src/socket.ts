// Client <-> server messages. Each carries the protocol version, so a stale phone is told to reload.
import { z } from 'zod';
import { CardsAction, CardsView } from './cards';
import { Command } from './commands';
import { RoleId, RolePreference } from './ids';
import { View, RoleCard } from './views';

export const PROTOCOL_VERSION = 1;

const v = z.literal(PROTOCOL_VERSION);
const RequestId = z.string().min(1).max(64);

export const Jinx = z.object({ a: RoleId, b: RoleId, text: z.string() });
export type Jinx = z.infer<typeof Jinx>;

export const ClientMessage = z.discriminatedUnion('type', [
  z.strictObject({ v, type: z.literal('hello'), buildId: z.string().max(64) }),
  z.strictObject({ v, type: z.literal('command'), requestId: RequestId, command: Command }),
  z.strictObject({ v, type: z.literal('ping') }),
  /** The idle card game. It is not a command: nothing is stored and nothing is acknowledged. */
  z.strictObject({ v, type: z.literal('cards'), action: CardsAction }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({
    v,
    type: z.literal('welcome'),
    buildId: z.string(),
    /** Every role the app knows. The client never has its own copy. */
    catalog: z.array(RoleCard),
    jinxes: z.array(Jinx),
  }),
  z.object({ v, type: z.literal('view'), view: View }),
  z.object({
    v,
    type: z.literal('ack'),
    requestId: RequestId,
    ok: z.boolean(),
    error: z.string().optional(),
    data: z.unknown().optional(),
  }),
  z.object({ v, type: z.literal('removed') }),
  z.object({ v, type: z.literal('reload') }),
  z.object({ v, type: z.literal('pong') }),
  /** This phone's card table, or null when it has no place at one just now. */
  z.object({ v, type: z.literal('cards'), table: CardsView.nullable() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

// ---- HTTP ----
export const JoinRequest = z.strictObject({
  name: z.string().min(1).max(64),
  rolePreference: RolePreference.optional(),
  wantsStoryteller: z.boolean().optional(),
  password: z.string().max(200).optional(),
});
export type JoinRequest = z.infer<typeof JoinRequest>;

export const RejoinRequest = z.strictObject({
  playerId: z.string().min(1).max(64),
  password: z.string().max(200).optional(),
});
export type RejoinRequest = z.infer<typeof RejoinRequest>;

export const ConfigResponse = z.object({
  publicUrl: z.string(),
  defaultGame: z.string(),
  passwordRequired: z.boolean(),
  buildId: z.string(),
});
export type ConfigResponse = z.infer<typeof ConfigResponse>;
