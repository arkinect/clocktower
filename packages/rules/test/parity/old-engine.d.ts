// The old engine, as far as the parity harness uses it. Aliased in vitest.config.ts; deleted at cutover.
declare module '@old/engine' {
  export interface OldChoice {
    decline?: boolean;
    values: string[];
  }
  export interface OldField {
    kind: string;
    options: string[];
  }
  export interface OldSpec {
    key: string;
    roleId: string;
    fields: OldField[];
    distinct: boolean;
    allowDecline: boolean;
  }
  export interface OldReviewItem {
    key: string;
    kind: string;
    title: string;
    options: { id: string; label: string }[];
    default: string;
    chosen: string | null;
  }
  export interface OldResult {
    key: string;
    playerId: string;
    roleId: string;
    trueLines: string[];
    finalLines: string[];
    impaired: boolean;
  }
  export interface OldFollowUp {
    key: string;
    playerId: string;
    roleId: string;
    spec: OldSpec;
    answered: boolean;
  }
  export interface OldResolution {
    results: OldResult[];
    reviewItems: OldReviewItem[];
    deaths: string[];
    revived: string[];
    followUps: OldFollowUp[];
    notices: { playerId: string; title: string; lines: string[] }[];
    log: string[];
    abnormal: { playerId: string; cause: string; detail: string }[];
  }
  export interface OldState {
    phase: string;
    nightNumber: number;
    players: { id: string; name: string; alive: boolean }[];
    assignments: Record<string, { roleId: string | null; alignment: string; eatenAbility?: unknown }>;
    dayPrompts: { id: string }[];
    effects: { type: string; targetPlayerId: string }[];
    night: { followUpAnswers: Record<string, unknown> } | null;
  }
  export type OldIntent = { type: string } & Record<string, unknown>;
  export type OldApply = { ok: true; state: OldState } | { ok: false; error: string };
  export function createGame(code: string, now: number): OldState;
  export function joinPlayer(
    s: OldState,
    req: { name: string; rolePreference: string; wantsAdmin: boolean },
    token: string,
    now: number,
  ): { ok: true; state: OldState; player: { id: string } } | { ok: false; error: string };
  export function applyIntent(
    s: OldState,
    actor: string,
    intent: OldIntent,
    ctx: { now: number; seed: number },
  ): OldApply;
  export function resolveNight(s: OldState, now: number): OldResolution;
  export function actionSpecs(s: OldState, pid: string): OldSpec[];
  export function computeImpairment(s: OldState, night: number): Record<string, { impaired: boolean } | undefined>;
  export function abilityNightToday(night: number): number;
}
