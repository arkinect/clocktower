// The one place that decides who is drunk or poisoned. Computed in three fixed stages, so that mutual dependencies
// have exactly one answer: stages 2 and 3 are judged against stage 1 only and never feed back into each other.
import type { PlayerId } from '@ct/protocol';
import type { ImpairingCondition } from '../abilities/define';
import { findRole, roleDef } from '../abilities/registry';
import type { Condition, GameState, Moment } from '../model/state';
import { HookCtx } from '../night/context';
import { Reader } from './reader';

export interface Impairment {
  impaired: boolean;
  causes: string[];
}

export type ActiveCondition = ImpairingCondition;

const impairs = (c: Condition) => c.type === 'drunk' || c.type === 'poisoned';

function sourceInfo(w: GameState, c: Condition): { player: PlayerId | null; label: string } {
  if (c.source.kind === 'storyteller') return { player: null, label: 'storyteller' };
  const a = w.abilities[c.source.id];
  const player = a?.holder.kind === 'player' ? a.holder.id : null;
  return { player, label: findRole(a?.roleId ?? '')?.name ?? 'unknown' };
}

function toActive(w: GameState, c: Condition): ActiveCondition {
  const { player, label } = sourceInfo(w, c);
  return {
    type: c.type as 'drunk' | 'poisoned',
    target: c.target,
    sourcePlayer: player,
    label: `${c.type}:${label}`,
  };
}

/** Every condition that impairs someone right now, including derived ones. */
export function activeImpairing(w: GameState, moment: Moment): ActiveCondition[] {
  const r = new Reader(w, moment);
  const stored = w.conditions.filter(impairs);
  // Stage 1: conditions with no dependency on their source.
  const base = stored.filter((c) => c.until !== 'while_source_works');
  const stage1 = new Set(base.map((c) => c.target));
  const works = (id: PlayerId | null) => id !== null && r.isAlive(id) && !stage1.has(id);

  // Stage 2: conditions that last while their source's ability works, judged against stage 1.
  const dependent = stored.filter((c) => c.until === 'while_source_works' && works(sourceInfo(w, c).player));

  // Stage 3: derived conditions, their sources judged against stage 1.
  const derived: ActiveCondition[] = [];
  for (const a of r.instances) {
    const hook = roleDef(a.roleId).ability.deriveConditions;
    if (!hook || a.holder.kind !== 'player' || !works(a.holder.id)) continue;
    for (const d of hook(new HookCtx(r, a))) {
      derived.push({
        type: d.type,
        target: d.target,
        sourcePlayer: a.holder.id,
        label: `${d.type}:${roleDef(a.roleId).name}`,
      });
    }
  }
  const active = [...base.map((c) => toActive(w, c)), ...dependent.map((c) => toActive(w, c)), ...derived];

  // Shields, their holders judged against stage 1. A shield on its own holder works even while they are impaired.
  const shields = r.instances.filter((a) => roleDef(a.roleId).ability.shieldsFrom);
  if (!shields.length) return active;
  return active.filter(
    (c) =>
      !shields.some((a) => {
        const holder = a.holder.kind === 'player' ? a.holder.id : null;
        if (holder !== null && (!r.isAlive(holder) || (holder !== c.target && stage1.has(holder)))) return false;
        return roleDef(a.roleId).ability.shieldsFrom!(new HookCtx(r, a), c);
      }),
  );
}

export function computeImpairment(w: GameState, moment: Moment): Record<string, Impairment> {
  const out: Record<string, Impairment> = {};
  for (const s of w.seats) out[s.playerId] = { impaired: false, causes: [] };
  for (const c of activeImpairing(w, moment)) {
    const x = out[c.target];
    if (!x) continue;
    x.impaired = true;
    if (!x.causes.includes(c.label)) x.causes.push(c.label);
  }
  return out;
}

/** Impairment caused by another character: not the player's own ability, nor a Storyteller edit. */
export function externalImpairment(w: GameState, moment: Moment, player: PlayerId): string[] {
  return activeImpairing(w, moment)
    .filter((c) => c.target === player && c.sourcePlayer !== null && c.sourcePlayer !== player)
    .map((c) => c.label);
}
