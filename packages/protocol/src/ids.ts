import { z } from 'zod';

const id = z.string().min(1).max(64);

export const PlayerId = id.brand<'PlayerId'>();
export type PlayerId = z.infer<typeof PlayerId>;

export const AbilityId = id.brand<'AbilityId'>();
export type AbilityId = z.infer<typeof AbilityId>;

export const ConditionId = id.brand<'ConditionId'>();
export type ConditionId = z.infer<typeof ConditionId>;

export const GameId = id.brand<'GameId'>();
export type GameId = z.infer<typeof GameId>;

export const RoleId = id.brand<'RoleId'>();
export type RoleId = z.infer<typeof RoleId>;

/** Only rules/src/roles and rules/src/jinxes may call this (enforced by lint). Everything else receives RoleIds. */
export const roleId = (value: string): RoleId => value as RoleId;

export const Alignment = z.enum(['good', 'evil']);
export type Alignment = z.infer<typeof Alignment>;

export const CharacterType = z.enum(['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled', 'loric']);
export type CharacterType = z.infer<typeof CharacterType>;

export const RolePreference = z.enum(['townsfolk', 'outsider', 'minion', 'demon', 'none']);
export type RolePreference = z.infer<typeof RolePreference>;
