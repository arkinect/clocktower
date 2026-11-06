// Section 5.7. The only place that decides who is drunk or poisoned.
import type { Effect, WorldState } from '@ct/shared';
import { isAlive, nearestMatching, roleIdOf, seatedIds, typeOf } from './world';

export interface Impairment { impaired: boolean; causes: string[] }

/** Effects that impair someone right now, including derived No Dashii poison. */
export function activeImpairingEffects(w: WorldState, night: number): Effect[] {
  const stored = w.effects.filter((e) => e.type === 'poisoned' || e.type === 'drunk');
  // Keyed on the cause too: a Philosopher's drunk effect is stored as until_removed.
  const dependsOnSource = (e: Effect) => e.expiry === 'while_source_alive_and_sober' || e.cause === 'philosopher';
  const unconditional = stored.filter((e) => !dependsOnSource(e));
  const pass1 = new Set<string>(unconditional.map((e) => e.targetPlayerId));
  for (const id of seatedIds(w)) {
    const r = roleIdOf(w, id);
    if (r === 'drunk' || r === 'marionette') pass1.add(id);
  }
  const soberAlive = (id: string | null) => !!id && isAlive(w, id) && !pass1.has(id);

  const derived: Effect[] = stored.filter((e) => dependsOnSource(e) && soberAlive(e.sourcePlayerId));
  for (const id of seatedIds(w)) {
    if (roleIdOf(w, id) !== 'no_dashii' || !soberAlive(id)) continue;
    for (const t of nearestMatching(w, id, (p) => typeOf(w, p) === 'townsfolk')) {
      derived.push({ id: `nd-${id}-${t}`, type: 'poisoned', cause: 'no_dashii', sourcePlayerId: id, targetPlayerId: t, startNight: night, expiry: 'while_source_alive_and_sober' });
    }
  }
  return [...unconditional, ...derived];
}

/** Impairment caused by another character (not the player's own ability, own character, or a Storyteller edit). */
export function externalImpairment(w: WorldState, night: number, pid: string): string[] {
  return activeImpairingEffects(w, night)
    .filter((e) => e.targetPlayerId === pid && e.sourcePlayerId !== pid && e.cause !== 'admin')
    .map((e) => `${e.type}:${e.cause}`);
}

export function computeImpairment(w: WorldState, night: number): Record<string, Impairment> {
  const out: Record<string, Impairment> = {};
  for (const id of seatedIds(w)) out[id] = { impaired: false, causes: [] };
  for (const id of seatedIds(w)) {
    const r = roleIdOf(w, id);
    if (r === 'drunk' || r === 'marionette') {
      out[id].impaired = true;
      out[id].causes.push('own_character');
    }
  }
  for (const e of activeImpairingEffects(w, night)) {
    const x = out[e.targetPlayerId];
    if (!x) continue;
    x.impaired = true;
    const label = `${e.type}:${e.cause}`;
    if (!x.causes.includes(label)) x.causes.push(label);
  }
  return out;
}
