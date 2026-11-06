// Small helpers shared by the scenario tests.
import { roleId, type DecisionKey, type PlayerId, type RoleId } from '@ct/protocol';
import type { Scene } from '../scenario';

/** A player id from its short name. */
export const as = (id: string) => id as PlayerId;

/** A role id from its short name. */
export const chosen = (id: string): RoleId => roleId(id);

/** Follow-up questions nobody has answered yet. */
export const open = (s: Scene) => s.res.questions.filter((q) => !q.answered);

/** The review row for a player's ability tonight. */
export const row = (s: Scene, id: string, role?: string) =>
  s.res.actors.find((a) => a.playerId === id && (!role || a.roleId === role));

/** The message titles a player has been sent. */
export const titles = (s: Scene, id: string) => s.g.view(as(id)).me.messages.map((m) => m.title);

/** Who the Storyteller's board is waiting for. */
export const expected = (s: Scene) =>
  (s.g.grimoire().board ?? []).filter((r) => r.expected).map((r) => r.playerId as string);

/** A day action where a Recluse-like player answers as `option`: previewed for the decision, then accepted with it. */
export function shootAs(s: Scene, target: string, option: string) {
  const abilityId = s.ability('slayer');
  const day = { type: 'day_action' as const, abilityId, action: 'shoot', values: [target] };
  s.g.st({ ...day, mode: 'preview' });
  const { decisions } = s.g.data as { decisions: { key: DecisionKey }[] };
  const first = decisions[0];
  if (!first) throw new Error('No decision on that shot');
  s.g.st({ ...day, mode: 'accept', decisions: [{ key: first.key, option }] });
  return s.g.data as { summary: string; effective: boolean };
}
