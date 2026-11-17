// What a player is told and asked. The bare value comes first: a number, a yes or no, a player, a character. A role
// may put words around it. A holder who does not know an ability by its own name (the Cannibal's meal) gets the
// bare value and nothing else: no prompt, no labels, no sentence that would say what the ability is.
import type { ActionField, ActionSpec, PlayerId, RoleId } from '@ct/protocol';
import type { AbilityInstance } from '../model/state';

/** A value a player can be told on its own. */
export type Answer =
  | { kind: 'number'; n: number }
  | { kind: 'yesno'; yes: boolean }
  | { kind: 'player'; id: PlayerId }
  | { kind: 'character'; role: RoleId }
  /** A player and their character, both of which they learn. */
  | { kind: 'playerCharacter'; player: PlayerId; role: RoleId | null }
  | { kind: 'characters'; roles: RoleId[] };

/** Words with no value behind them: a confirmation, or why there is nothing to tell. */
export interface Note {
  kind: 'note';
  lines: string[];
}

export const num = (n: number) => ({ kind: 'number', n }) as const;
export const yesNo = (yes: boolean) => ({ kind: 'yesno', yes }) as const;
export const player = (id: PlayerId) => ({ kind: 'player', id }) as const;
export const character = (role: RoleId) => ({ kind: 'character', role }) as const;
export const playerCharacter = (of: PlayerId, role: RoleId | null) =>
  ({ kind: 'playerCharacter', player: of, role }) as const;
export const characters = (roles: RoleId[]) => ({ kind: 'characters', roles }) as const;
export const note = (lines: string[]): Note => ({ kind: 'note', lines });

export interface Names {
  name(id: PlayerId): string;
  roleName(id: string | null): string;
}

/** The value alone, as the phone shows it. */
export function bare(a: Answer, names: Names): string[] {
  switch (a.kind) {
    case 'number':
      return [String(a.n)];
    case 'yesno':
      return [a.yes ? 'Yes' : 'No'];
    case 'player':
      return [names.name(a.id)];
    case 'character':
      return [names.roleName(a.role)];
    case 'playerCharacter':
      return [`${names.name(a.player)}: ${names.roleName(a.role)}`];
    case 'characters':
      return [a.roles.length ? a.roles.map((r) => names.roleName(r)).join(', ') : 'None'];
  }
}

/** The holder does not know this ability by its own name, so nothing they see may say what it is. */
export const masked = (a: AbilityInstance<unknown>) => a.shownAs !== a.roleId;

const KIND_LABEL: Record<ActionField['kind'], string> = { player: 'Player', role: 'Character', option: 'Choice' };

/** A field's label when nothing else names it: its kind, numbered when there are several of that kind. */
export function plainLabel(fields: readonly Pick<ActionField, 'kind'>[], i: number): string {
  const kind = (fields[i] as Pick<ActionField, 'kind'>).kind;
  const same = fields.filter((f) => f.kind === kind).length;
  const nth = fields.slice(0, i + 1).filter((f) => f.kind === kind).length;
  return same > 1 ? `${KIND_LABEL[kind]} ${nth}` : KIND_LABEL[kind];
}

/** No legal answer: a field with no options, or too few players to choose different ones. */
export function noLegalChoice(fields: readonly Pick<ActionField, 'kind' | 'options'>[], distinct: boolean): boolean {
  const players = fields.filter((f) => f.kind === 'player');
  const pool = new Set(players.flatMap((f) => f.options));
  return fields.some((f) => f.options.length === 0) || (distinct && pool.size < players.length);
}

export const NO_LEGAL_CHOICE = 'No legal choice';

/** The picker with its words taken away: plain labels by kind, no prompt, and no names for the options. */
export function bareSpec(spec: ActionSpec): ActionSpec {
  const { declineLabel, ...rest } = spec;
  const stuck = noLegalChoice(spec.fields, spec.distinct);
  return {
    ...rest,
    prompt: '',
    fields: spec.fields.map((f, i) => ({ kind: f.kind, label: plainLabel(spec.fields, i), options: f.options })),
    ...(stuck && declineLabel ? { declineLabel: NO_LEGAL_CHOICE } : {}),
  };
}
