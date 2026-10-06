// Scripted multi-night games with random setups and random legal choices. Checks the engine never crashes
// and that hidden information never reaches a player view.
import { describe, expect, it } from 'vitest';
import { ROLE_BY_ID, type ActionChoice } from '@ct/shared';
import { applyIntent, createGame, joinPlayer } from '../src/engine/game';
import { makeRng } from '../src/engine/rng';
import { playerView } from '../src/engine/views';
import { actionSpecs } from '../src/engine/actions';

function play(seed: number, playerCount: number, nights: number) {
  const rng = makeRng(seed);
  let s = createGame('fz', 0);
  let now = 1;
  const j = joinPlayer(s, { name: 'ST', rolePreference: 'none', wantsAdmin: true }, 'a', now++);
  if (!j.ok) throw new Error(j.error);
  s = j.state;
  const admin = j.player.id;
  const ids: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const r = joinPlayer(s, { name: `N${i}`, rolePreference: 'none', wantsAdmin: false }, `t${i}`, now++);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    ids.push(r.player.id);
  }
  const A = (intent: Parameters<typeof applyIntent>[2], actor = admin) => {
    const r = applyIntent(s, actor, intent, { now: now++, seed: rng.int(1e9) });
    if (!r.ok) throw new Error(`${intent.type}: ${r.error}`);
    s = r.state;
    return r;
  };
  A({ type: 'go_setup' });
  A({ type: 'randomise_seating' });
  const sug = A({ type: 'suggest_distribution' }).data as Record<string, string>;
  A({ type: 'assign_many', assignments: sug });
  const inPlay = Object.values(sug);
  const notInPlay = (pred: (r: string) => boolean) => Object.keys(ROLE_BY_ID).filter((r) => pred(r) && !inPlay.includes(r));
  const believed: string[] = [];
  for (const [pid, r] of Object.entries(sug)) {
    if (r === 'drunk' || r === 'marionette') {
      const b = notInPlay((x) => ROLE_BY_ID[x].type === 'townsfolk' && !believed.includes(x))[0];
      believed.push(b);
      A({ type: 'set_believed_role', playerId: pid, roleId: b });
    }
  }
  if (inPlay.includes('fortune_teller')) A({ type: 'suggest_red_herring' });
  if (inPlay.includes('mezepheles')) A({ type: 'random_mezepheles_word' });
  if (inPlay.includes('lil_monsta')) A({ type: 'set_lil_monsta_minion', roleId: notInPlay((x) => ROLE_BY_ID[x].type === 'minion')[0] });
  if (inPlay.includes('godfather')) A({ type: 'set_godfather_outsiders', value: 1 });
  A({ type: 'suggest_bluffs' });
  A({ type: 'begin_night0' });
  A({ type: 'start_collecting' });

  for (let n = 0; n <= nights; n++) {
    if (n > 0) A({ type: 'start_night' });
    for (const pid of ids) {
      const specs = actionSpecs(s, pid);
      const actions: Record<string, ActionChoice> = {};
      for (const sp of specs) {
        if (sp.allowDecline && (rng.next() < 0.3 || sp.fields.some((f) => f.options.length === 0) || (sp.distinct && new Set(sp.fields.flatMap((f) => f.options)).size < sp.fields.length))) { actions[sp.key] = { decline: true, values: [] }; continue; }
        const used = new Set<string>();
        const values = sp.fields.map((f) => {
          const opts = f.options.filter((o) => !(sp.distinct && f.kind === 'player' && used.has(o)));
          const v = rng.pick(opts);
          used.add(v);
          return v;
        });
        actions[sp.key] = { values };
      }
      const p = s.players.find((x) => x.id === pid)!;
      if (p.alive || specs.length || s.assignments[pid]?.retainsAbilityWhenDead) A({ type: 'submit_night', actions }, pid);
    }
    A({ type: 'resolve_night' });
    for (const rk of s.night!.resolution!.awaitingRavenkeeper) A({ type: 'submit_ravenkeeper', targetId: rng.pick(ids) }, rk);
    A({ type: 'accept_all_defaults' });
    A({ type: 'publish_night' });
    expect(s.phase).toBe('DAY');
    // day facts
    A({ type: 'set_day_fact', key: 'demonVoted', value: rng.coin() });
    if (n === 0) A({ type: 'set_day_fact', key: 'jugglerCorrect', value: rng.int(6) });
    const aliveIds = ids.filter((id) => s.players.find((p) => p.id === id)!.alive);
    if (aliveIds.length > 3 && rng.next() < 0.5) A({ type: 'record_execution', playerId: rng.pick(aliveIds), died: true });
    for (const dp of s.dayPrompts) A({ type: 'resolve_day_prompt', id: dp.id, accept: rng.coin() });

    // Hidden-information checks on every player view.
    for (const pid of ids) {
      const v = playerView(s, pid, 0);
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/"assignments"|"effects"|"impaired"|"causes"|"reviewItems"|"grimoire"/);
      const real = s.assignments[pid]?.roleId;
      if (real === 'drunk' || real === 'marionette') {
        expect(v.me.role?.roleId).not.toBe(real);
      }
      if (real === 'drunk') {
        for (const m of v.me.messages) expect(m.lines.join(' ') + m.title).not.toMatch(/\bDrunk\b/);
      }
    }
  }
  return s;
}

describe('randomised multi-night games', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const count = 5 + (seed % 11);
    it(`seed ${seed}, ${count} players`, () => {
      const s = play(seed, count, 4);
      expect(s.dayNumber).toBe(5);
    });
  }
});
