// Whole autoplay games from deal to winner, with random play and no Storyteller command. Every one must end, and what
// the steward and the phones are shown must never move with anything hidden.
import { describe, expect, it } from 'vitest';
import type { PlayerId, StewardView } from '@ct/protocol';
import { project, resolveNight, stewardView, type GameStateT } from '../../src';
import { setupChecklist, setupWarnings } from '../../src/setup/rules';
import { makeRng, type Rng } from '../../src/util/rng';
import { autoScript, table, type AutoGame } from '../helpers/autoplay';
import { eachSeed, FUZZ_GAMES } from '../helpers/fuzz';

/** The same game with every hidden fact but the steward's own rewritten. */
function blanked(s: GameStateT, me: PlayerId): GameStateT {
  const own = (a: { holder: { kind: string; id?: unknown } }) => a.holder.kind === 'player' && a.holder.id === me;
  return {
    ...s,
    players: new Map(
      [...s.players].map(([id, p]) => [
        id,
        id === me
          ? p
          : {
              ...p,
              character: null,
              alignment: 'good' as const,
              self: { character: null, alignment: 'good' as const },
              history: [],
              rolePreference: 'none' as const,
            },
      ]),
    ),
    abilities: new Map([...s.abilities].filter(([, a]) => own(a))),
    conditions: [],
    inbox: new Map([[me, s.inbox.get(me) ?? []]]),
    events: [],
    prompts: [],
    gameEnd: [],
    setup: { ...s.setup, bag: new Map(), bluffs: [] },
    autoplay: s.autoplay && {
      ...s.autoplay,
      demonDead: !s.autoplay.demonDead,
      nominations: s.autoplay.nominations.map((x) => ({
        ...x,
        vote: x.vote && { ...x.vote, demon: !x.vote.demon },
        before: { abilities: [], conditions: [], events: 0 },
      })),
    },
  };
}

/** Their own night choice and questions come from their own ability, and the rest of the view must not. */
function withoutOwnChoice(v: StewardView): StewardView {
  const me = { ...v.me.me, actions: [], questions: [], grants: [], dayPrompts: undefined };
  return { ...v, me: { ...v.me, me: me as typeof v.me.me } };
}

function checkHidden(g: AutoGame) {
  const s = g.state;
  const me = s.stewardId;
  if (!me || s.phase.kind === 'ended') return;
  const view = stewardView(s, me, { now: g.now });
  expect(JSON.stringify({ ...view, me: null })).not.toMatch(
    /"(character|alignment|conditions|impaired|bag|seed|submissions|abilities|demonDead|rolePreference)"/,
  );
  const other = stewardView(blanked(s, me), me, { now: g.now });
  // Whether a question is open can be told only once dawn could be called, and is then told.
  if (view.night && view.night.dawn !== 'soon' && other.night) {
    other.night.dawn = view.night.dawn;
    other.night.canSkip = view.night.canSkip;
  }
  expect(withoutOwnChoice(other)).toEqual(withoutOwnChoice(view));
}

function playDay(g: AutoGame, rng: Rng, step: () => void) {
  const ids = g.ids;
  const p = () => rng.pick(ids);
  for (let i = rng.int(5); i > 0 && !g.console().over && !g.console().day?.closed; i--) {
    const day = g.console().day as NonNullable<StewardView['day']>;
    const kind = rng.int(3);
    if (kind === 0 && day.claims.length) {
      const c = rng.pick(day.claims);
      g.sw({ type: 'make_claim', roleId: c.roleId, claim: c.claim, values: c.fields.map(p) });
    } else {
      g.sw({ type: 'nominate', nominator: p(), nominee: p() });
      step();
      const last = g.console().day?.nominations.at(-1);
      if (last && !g.console().over && !g.console().day?.closed) {
        if (last.canUndo && rng.int(4) === 0) g.sw({ type: 'undo_nomination', id: last.id });
        else g.sw({ type: 'count_vote', id: last.id, voters: ids.filter(() => rng.coin()) });
      }
    }
    step();
    for (const id of ids) {
      for (const spec of g.view(id).me.dayPrompts ?? []) {
        const values = spec.fields.map((f) => rng.pick(f.options));
        g.as(id, { type: 'answer_day_prompt', key: spec.key, values });
        step();
      }
    }
  }
  const { over, day } = g.console();
  if (!over && !day?.closed) {
    const alive = g.console().players.filter((x) => x.alive);
    const yes = day?.executionQuestions.filter(() => rng.int(3) === 0).map((q) => q.roleId) ?? [];
    g.sw({ type: 'execute', playerId: alive.length && rng.int(6) ? rng.pick(alive).id : null, yes });
    step();
  }
}

describe('whole autoplay games', () => {
  it(
    `${FUZZ_GAMES} random games all end`,
    () => {
      eachSeed(FUZZ_GAMES, playGame);
    },
    60_000 + FUZZ_GAMES * 1000,
  );
});

function playGame(seed: number) {
  const rng = makeRng(seed * 31);
  const script = seed % 3 ? autoScript() : rng.shuffle(autoScript()).slice(0, 42);
  const count = 5 + (seed % 11);
  const g = table(count, script, seed * 1009);
  const step = () => checkHidden(g);
  step();
  const res = g.tryAs(g.steward, { type: 'deal' });
  if (!res.ok) {
    // Only a script too short of something for this table.
    expect(res.error).toMatch(/Not enough|No legal/);
    expect(script.length).toBe(42);
    return;
  }
  expect(setupChecklist(g.state).every((c) => c.done)).toBe(true);
  expect(setupWarnings(g.state)).toEqual([]);
  step();
  for (let n = 0; n < 60 && g.state.phase.kind !== 'ended'; n++) {
    if (g.console().phase.stage === 'briefing') g.sw({ type: 'open_night' });
    g.submitAll(rng);
    step();
    g.answerAll(rng);
    step();
    expect(resolveNight(g.state).decisions.filter((d) => d.required && d.chosen === null)).toEqual([]);
    g.wait(31).sw({ type: 'call_dawn' });
    step();
    if (!g.console().over) playDay(g, rng, step);
    if (g.console().over) g.sw({ type: 'announce_end' });
    else g.sw({ type: 'begin_night' });
    step();
  }
  expect(g.state.phase.kind).toBe('ended');
  const end = project(g.state, g.steward, { now: g.now });
  expect(end.kind === 'steward' && end.revealed?.players.length).toBe(count);
}
