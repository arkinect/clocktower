// One row per seated player for a night: what they did, what impaired them and what they learned. Stored when the
// night is published, and shown live on the Review tab before that.
import { computeImpairment } from '../derive/impairment';
import type { GameState, StoryRow } from '../model/state';
import type { Resolution } from './run';

export function nightStory(s: GameState, res: Resolution, n: number): StoryRow[] {
  const end = computeImpairment(res.after, { kind: 'night', n });
  return s.seats
    .filter((x) => x.left === null)
    .map(({ playerId: pid }) => {
      const p = s.players[pid]!;
      const rows = res.actors.filter((r) => r.playerId === pid);
      const causes = new Set(rows.flatMap((r) => r.causes));
      for (const c of end[pid]?.causes ?? []) causes.add(c);
      return {
        playerId: pid,
        name: p.name,
        character: p.character,
        believed: s.setup.bag[pid] ?? null,
        alignment: p.alignment,
        aliveAtStart: p.life.alive,
        aliveAtEnd: !!res.after.players[pid]?.life.alive,
        impaired: causes.size > 0,
        causes: [...causes],
        actions: rows.map((r) => ({ slot: r.slot, input: r.input, outcome: r.outcome })),
        received: [
          ...res.results
            .filter((r) => r.playerId === pid)
            .map((r) => ({
              title: r.title,
              lines: r.final,
              truth: r.final.join('\n') !== r.truth.join('\n') ? r.truth : null,
            })),
          ...res.notices
            .filter((x) => x.playerId === pid)
            .map((x) => ({ title: x.title, lines: x.lines, truth: null })),
        ],
      };
    });
}
