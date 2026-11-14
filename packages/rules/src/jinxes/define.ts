// A jinx is one file per pair. It carries the official text, and may add behaviour at the extension points below.
// Both roles' files stay free of each other's names: a role calls a generic extension, the jinx answers it.
import type { PlayerId, RoleId } from '@ct/protocol';
import type { Reader } from '../derive/reader';
import type { AbilityCtx } from '../night/context';

export interface JinxDef {
  a: RoleId;
  b: RoleId;
  text: string;
  /** 'reminder': the app only shows it. 'engine': it also applies it, with a test named after the label. */
  handling: 'reminder' | 'engine';
  source: string;
  hooks?: JinxHooks;
}

export interface JinxHooks {
  /** An ability was gained by a role's own effect (an eat, for instance). Return true to reveal it to the holder. */
  onGain?(ctx: AbilityCtx<unknown>, gained: RoleId): boolean;
  /** Extra players counted as malfunctioning, computed when the count is taken. */
  beforeMalfunctionCount?(ctx: AbilityCtx<unknown>): void;
  /** Lets a jinx wake an ability that would otherwise stay asleep. */
  wakes?(ctx: AbilityCtx<unknown>): boolean;
  /** Runs after any revival; returns a player it changed. */
  afterRevive?(ctx: AbilityCtx<unknown>): PlayerId | null;
  /** Replaces what a role's ability does tonight. Return true when handled. */
  replaceResolve?(ctx: AbilityCtx<unknown>): boolean;
  /** Replaces the picker of a role tonight. */
  replacePicker?: AbilityHookPicker;
  /** Whether a dead holder wakes tonight. */
  wakesDead?(ctx: AbilityCtx<unknown>): boolean;
  /** Setup checklist rows. */
  checklist?(r: Reader): { id: string; label: string; done: boolean; blocking: boolean }[];
  warnings?(r: Reader): string[];
}

export type AbilityHookPicker = (ctx: AbilityCtx<unknown>) => import('../abilities/define').SpecDraft | null;

export function defineJinx(jinx: JinxDef): JinxDef {
  return jinx;
}
