import { z } from 'zod';
import { AbilityId, RoleId } from './ids';

const text = z.string().max(500);
const optionId = z.string().min(1).max(64);

/** The three field kinds are the only thing the client knows about ability input. */
export const ActionField = z.object({
  kind: z.enum(['player', 'role', 'option']),
  label: text,
  options: z.array(optionId).max(128),
  labels: z.record(optionId, text).optional(),
});
export type ActionField = z.infer<typeof ActionField>;

export const ActionSpec = z.object({
  /** The key its answer is submitted under: an ability id at night, a question key for a question. */
  key: z.string().min(1).max(200),
  /** The role this player thinks they act as. */
  roleId: RoleId.nullable(),
  title: text,
  prompt: text,
  fields: z.array(ActionField).max(8),
  distinct: z.boolean(),
  allowDecline: z.boolean(),
  declineLabel: text.optional(),
});
export type ActionSpec = z.infer<typeof ActionSpec>;

export const Choice = z.object({
  decline: z.boolean().optional(),
  values: z.array(optionId).max(8),
});
export type Choice = z.infer<typeof Choice>;

export const Actions = z.record(z.string().min(1).max(64), Choice);
export type Actions = z.infer<typeof Actions>;

export const DayActionSpec = ActionSpec.extend({
  abilityId: AbilityId,
  action: z.string().min(1).max(64),
  /** Consequential actions are previewed, then accepted. */
  preview: z.boolean(),
  /** Today's recorded answer, one value per field, or null when nothing is recorded. */
  recorded: z.array(optionId).nullable(),
  /** Tonight reads this answer: a hint for the Day tab only. A missing one is asked for in Review. */
  neededTonight: z.boolean(),
});
export type DayActionSpec = z.infer<typeof DayActionSpec>;

/** Identifies what is being decided, never how far the walk got. */
export const DecisionKey = z.object({
  kind: z.string().min(1).max(64),
  ability: AbilityId.nullable().optional(),
  subject: z.string().max(64).nullable().optional(),
  detail: z.string().max(64).nullable().optional(),
});
export type DecisionKey = z.infer<typeof DecisionKey>;

export const Decisions = z.array(z.object({ key: DecisionKey, option: optionId })).max(64);
export type Decisions = z.infer<typeof Decisions>;
