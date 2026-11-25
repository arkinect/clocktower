// The odds of what the app draws in place of a Storyteller, over many nights.
import { describe, expect, it } from 'vitest';
import { roleId, type RoleId } from '@ct/protocol';
import { findRole, resolveNight, type GameStateT } from '../../src';
import { clone } from '../../src/util/clone';
import { autoCast, type AutoGame } from '../helpers/autoplay';
import { pid } from '../helpers/game';
import { MINION, TOWN } from '../helpers/plain';

const r = (x: string) => roleId(x);

/** This night's resolution from a fresh seed. */
function seeded(g: AutoGame, seed: number): GameStateT {
  const s = clone(g.state) as GameStateT;
  if (s.phase.kind === 'night') s.phase.seed = seed * 104729 + 13;
  return s;
}

const tally = <T>(n: number, draw: (seed: number) => T) => {
  const out = new Map<T, number>();
  for (let i = 1; i <= n; i++) {
    const x = draw(i);
    out.set(x, (out.get(x) ?? 0) + 1);
  }
  return out;
};

/** Everyone presses done, and the night is in. */
function closed(g: AutoGame, actions: Record<string, string[]> = {}) {
  for (const id of g.ids) {
    const spec = g.view(id).me.actions[0];
    const name = Object.keys(actions).find((x) => pid(x) === id);
    const values = name ? (actions[name] as string[]).map((x) => (findRole(x as RoleId) ? x : pid(x))) : null;
    const choice = values ? { values } : { decline: true, values: [] };
    if (name && spec) g.as(id, { type: 'submit_night', actions: { [spec.key]: choice } });
    else g.sw({ type: 'set_away', playerId: id, away: true });
  }
  return g.autopilot();
}

const told = (s: GameStateT, who: string) => {
  const row = resolveNight(s).results.find((x) => x.playerId === pid(who));
  return { final: row?.final.join(' ') ?? '', truth: row?.truth.join(' ') ?? '' };
};

describe('impaired information', () => {
  it('is true one time in four, and otherwise any of the false answers', () => {
    const g = autoCast(
      { ann: r('empath'), bo: r('imp'), cy: MINION[0] as RoleId, di: TOWN[0] as RoleId, ed: TOWN[1] as RoleId },
      { open: (x) => void x.st({ type: 'add_condition', target: pid('ann'), condition: 'drunk' }) },
    );
    closed(g);
    const n = 2000;
    const seen = tally(n, (i) => told(seeded(g, i), 'ann').final);
    const truth = told(g.state, 'ann').truth;
    expect((seen.get(truth) ?? 0) / n).toBeGreaterThan(0.2);
    expect((seen.get(truth) ?? 0) / n).toBeLessThan(0.3);
    expect(seen.size).toBe(3);
    for (const [k, v] of seen) if (k !== truth) expect(v / n).toBeGreaterThan(0.3);
  });

  it('is always something the Grandmother could be told', () => {
    const g = autoCast(
      {
        ann: r('grandmother'),
        bo: r('imp'),
        cy: MINION[0] as RoleId,
        di: r('empath'),
        ed: TOWN[1] as RoleId,
        flo: r('butler'),
      },
      { open: (x) => void x.st({ type: 'add_condition', target: pid('ann'), condition: 'drunk' }) },
    );
    closed(g, { flo: ['ann'] });
    const n = 1500;
    let honest = 0;
    for (let i = 1; i <= n; i++) {
      const { final } = told(seeded(g, i), 'ann');
      const role = [...g.state.script].find((x) => final.includes(findRole(x)?.name as string)) as RoleId;
      expect(findRole(role)?.type, final).toMatch(/townsfolk|outsider/);
      expect(final).not.toMatch(/\bann\b/i);
      const real = [...g.state.players.values()].find((p) => final.toLowerCase().includes(p.name.toLowerCase()));
      if (real?.character === role) honest += 1;
    }
    expect(honest / n).toBeGreaterThan(0.2);
    expect(honest / n).toBeLessThan(0.31);
  });
});

describe('Mathematician', () => {
  it('counts an impaired ability only when it went wrong', () => {
    const g = autoCast({
      ann: r('empath'),
      bo: r('imp'),
      cy: r('poisoner'),
      di: r('mathematician'),
      ed: TOWN[1] as RoleId,
      flo: TOWN[2] as RoleId,
    });
    closed(g, { cy: ['ann'] });
    let honest = 0;
    for (let i = 1; i <= 300; i++) {
      const s = seeded(g, i);
      const { final, truth } = told(s, 'ann');
      const count = told(s, 'di').final;
      if (final === truth) honest += 1;
      expect(count, `${final} / ${truth}`).toContain(final === truth ? '0' : '1');
    }
    expect(honest).toBeGreaterThan(40);
  });
});

describe('a starpass', () => {
  it('goes to any living Minion, evenly', () => {
    const g = autoCast({
      ann: r('imp'),
      bo: MINION[0] as RoleId,
      cy: MINION[1] as RoleId,
      di: TOWN[0] as RoleId,
      ed: TOWN[1] as RoleId,
      flo: TOWN[2] as RoleId,
    });
    closed(g).wait(31).sw({ type: 'call_dawn' }).as(g.steward, { type: 'execute', playerId: null, yes: [] });
    g.sw({ type: 'begin_night' });
    closed(g, { ann: ['ann'] });
    const heirs = tally(400, (i) => {
      const after = resolveNight(seeded(g, i)).after;
      return [...after.players.values()].find((p) => p.character === 'imp' && p.life.alive)?.name ?? '';
    });
    expect([...heirs.keys()].sort()).toEqual(['bo', 'cy']);
    for (const v of heirs.values()) expect(v).toBeGreaterThan(150);
  });
});
