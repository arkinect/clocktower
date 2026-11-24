import { z } from 'zod';

/** Never a name every object inherits: `players['constructor']` would find something. */
export const Id = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => !Object.hasOwn(Object.prototype, v));

/** Minted by the server when a player joins. */
export const PlayerId = z
  .string()
  .regex(/^[0-9a-f]{16}$/)
  .brand<'PlayerId'>();
export type PlayerId = z.infer<typeof PlayerId>;

/** Minted by the rules, as are condition ids, from the game's one counter. */
export const AbilityId = z
  .string()
  .regex(/^a[0-9]{1,9}$/)
  .brand<'AbilityId'>();
export type AbilityId = z.infer<typeof AbilityId>;

export const ConditionId = z
  .string()
  .regex(/^c[0-9]{1,9}$/)
  .brand<'ConditionId'>();
export type ConditionId = z.infer<typeof ConditionId>;

export const GameId = Id.brand<'GameId'>();
export type GameId = z.infer<typeof GameId>;

export const RoleId = Id.brand<'RoleId'>();
export type RoleId = z.infer<typeof RoleId>;

/** Only rules/src/roles and rules/src/jinxes may call this (enforced by lint). Everything else receives RoleIds. */
export const roleId = (value: string): RoleId => value as RoleId;

export const Alignment = z.enum(['good', 'evil']);
export type Alignment = z.infer<typeof Alignment>;

export const CharacterType = z.enum(['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled', 'loric']);
export type CharacterType = z.infer<typeof CharacterType>;

export const RolePreference = z.enum(['townsfolk', 'outsider', 'minion', 'demon', 'none']);
export type RolePreference = z.infer<typeof RolePreference>;
