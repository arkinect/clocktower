// Whole games from a suggested setup with random legal choices: nothing crashes and no phone learns what it should not.
import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@ct/protocol';
import { defaultScript } from '../../src';
import { makeRng, type Rng } from '../../src/util/rng';
import { randomActions, seatedIds } from '../helpers/fuzz';
import { pid, ST, TestGame } from '../helpers/game';

function setUp(rng: Rng, count: number) {
  const g = new TestGame('W');
  g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
  const ids: PlayerId[] = [];
  for (let i = 0; i < count; i++) {
    const name = `N${i}`;
    ids.push(pid(name));
    g.as(null, { type: 'join', id: pid(name), name, rolePreference: 'none', wantsStoryteller: false });
  }
  g.st({ type: 'open_setup' });
  g.st({ type: 'set_script', roleIds: defaultScript() });
  g.st({ type: 'randomise_seating' });
  g.st({ type: 'suggest_distribution' });
  for (const [id, roles] of Object.entries(g.grimoire().setup.believedOptions)) {
    const role = roles.find((r) => !Object.values(g.state.setup.bag).includes(r));
    if (role) g.st({ type: 'set_believed', playerId: id as PlayerId, roleId: role });
  }
  for (const f of g.grimoire().setup.fields) {
    if (f.value !== null) continue;
    if (f.suggestible) g.st({ type: 'suggest_setup_field', abilityId: f.abilityId, field: f.field });
    else g.st({ type: 'set_setup_field', abilityId: f.abilityId, field: f.field, value: f.options[0]?.id ?? null });
  }
  g.st({ type: 'suggest_bluffs' });
  g.st({ type: 'begin_first_night', force: false });
  g.st({ type: 'open_collecting' });
  return { g, ids };
}

function playNight(g: TestGame, ids: PlayerId[], rng: Rng) {
  for (const id of ids) g.as(id, { type: 'submit_night', actions: randomActions(g.state, id, rng) });
  g.st({ type: 'close_collecting', force: true });
  // An answer can raise another question, so until none are left.
  for (;;) {
    const open = g.grimoire().review?.questions.filter((q) => !q.answered) ?? [];
    if (!open.length) break;
    for (const q of open) {
      const values = q.spec.fields.map((f) => rng.pick(f.options));
      g.as(q.playerId, { type: 'answer_question', key: q.key, choice: { values } });
    }
  }
  g.st({ type: 'accept_all_defaults' });
  // Facts the day didn't record (the Flowergirl's answer, the Moonchild's choice) have no default to accept.
  for (const d of g.grimoire().review?.decisions ?? []) {
    if (d.required && d.chosen === null) g.st({ type: 'decide', key: d.key, option: rng.pick(d.options).id });
  }
  g.st({ type: 'publish_dawn', force: false });
}

function playDay(g: TestGame, ids: PlayerId[], rng: Rng) {
  const alive = ids.filter((id) => g.player(id).life.alive);
  if (alive.length > 3 && rng.next() < 0.5) {
    g.st({ type: 'record_execution', playerId: rng.pick(alive), died: true });
  }
  for (const q of g.state.prompts) g.st({ type: 'resolve_prompt', id: q.id, option: rng.pick(q.options).id });
  for (const q of g.state.gameEnd) g.st({ type: 'dismiss_game_end', key: q.key });
  // Start Night waits for these (the Moonchild's choice, the Cannibal's false character): answer them at random.
  for (const d of g.grimoire().dayActions) {
    if (!d.blocksNight || d.recorded) continue;
    const values = d.fields.map((f) => rng.pick(f.options));
    g.st({ type: 'day_action', abilityId: d.abilityId, action: d.action, values, mode: 'accept' });
  }
}

function checkPhones(g: TestGame, ids: PlayerId[]) {
  for (const id of ids) {
    const view = g.view(id);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/"conditions"|"impaired"|"causes"|"decisions"|"bag"/);
    const real = g.player(id).character as string;
    if (real === 'drunk' || real === 'marionette') expect(view.me.role?.roleId).not.toBe(real);
    if (real === 'drunk') {
      for (const m of view.me.messages) expect(`${m.lines.join(' ')} ${m.title}`).not.toMatch(/\bDrunk\b/);
    }
  }
}

describe('randomised whole games', () => {
  it.each(Array.from({ length: 60 }, (_, i) => i + 1))('seed %i', (seed) => {
    const rng = makeRng(seed);
    const { g, ids } = setUp(rng, 5 + (seed % 11));
    for (let n = 0; n <= 4; n++) {
      if (n > 0) {
        g.st({ type: 'start_night' });
        if (g.state.phase.kind === 'night' && g.state.phase.stage !== 'collecting') g.st({ type: 'open_collecting' });
      }
      playNight(g, seatedIds(g.state), rng);
      expect(g.state.phase.kind).toBe('day');
      playDay(g, ids, rng);
      checkPhones(g, ids);
    }
  });
});
