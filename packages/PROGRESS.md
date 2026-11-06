# Rewrite progress

Session memory for the plan in `docs/rewrite/PLAN.md` (the working copy this session followed is `rebuild.md`, same substance).

## Stage status

| Stage         | Status | Gate                      |
| ------------- | ------ | ------------------------- |
| 0 Foundations | done   | passed, CI green          |
| 1 Rules core  | done   | passed                    |
| 2 Framework   | done   | passed locally, see below |
| 3 All roles   | done   | passed locally, see below |

## Baseline

Old app `npm test -w server` on b31c09a: 24 files, 385 tests, all passing.

## Gate results

### Stage 0

- CI green on empty packages: typecheck, lint, format, boundaries, tests, build and `npm audit --omit=dev` all pass locally.
- `npm run boundaries:selftest`: web importing rules, web importing server, rules importing a Node built-in, a RoleId constructor call in rules/src/night, Date.now, Math.random and crypto in rules are all rejected.
- `npm run dev` served /healthz through both the server and the Vite proxy.

### Stage 1

- `rules/test/core/game-loop.test.ts`: a scripted five-player game of ability-less characters runs lobby to ended.
- `rules/test/core/fuzz.test.ts`: 1,000 random command sequences of 120 steps, reaching every phase. No throw, every state parses against the schema, every player view passes the hidden-information check.
- Command-log replay: byte-identical, over the scripted game and 50 fuzzed games of 200 steps.

### Stage 2

- `docs/mechanics.md` written. The wiki pass covered the Character Types, Travellers, Fabled and Loric pages, not each character page.
- `rules/test/framework/mechanics.test.ts`: every mechanics row, with throwaway characters.
- Eight acceptance roles, tests in `rules/test/roles/`. `npm run check:role-ids`: no role id in core (added to CI).
- Stale decisions, the mutual-dependency impairment pin and determinism are in the same framework file.

### Stage 3

- All 55 roles and 14 jinxes, each role with its own file in `rules/test/roles/`, jinxes in `jinxes.test.ts`.
- Parity harness (`rules/test/parity/`): 10,000 fuzzed games, 54,509 nights, 6.6 million comparisons, 31,133 pinned decisions, 8,435 answered questions: no unexplained difference. A deliberate change to the Empath's text was caught, so the harness is not vacuous.
- It compares true result lines, result impairment, deaths, revivals, pickers and their options, questions, decisions asked, and after each dawn and day: alive, character, alignment, impairment.
- It does not compare suggested false information (random in both, by the plan), notices, game-end suggestions, or Storyteller edits such as `set_cannibal_ability`. Virgin, Golem and Witch prompts are new, so they have scenario tests only.
- Differences it found, all fixed in the new engine: a dead Godfather keeping their ability through the Vigormortis; a Drunk or Marionette staying drunk after becoming the Demon; the Moonchild's target belonging to every holder; a Moonchild regurgitated the same night still acting; a Mayor attacked twice in a night needing two decisions; re-eating the same ability refreshing it.
- Vigormortis and Scarlet Woman: `roles/vigormortis.test.ts`. The harness stops comparing a game once that ruling applies.

## Deviations

- zod 4 and @fastify/static 10 rather than the versions first picked: `npm audit --omit=dev` is a CI step and the older versions fail it.
- `@ct/rules` depends on zod directly, for the GameState schema (the plan lists protocol and immer).
- Rule 4 limits commits to packages/, docs/ and the two workflow files, and overrides the plan's layout, so deploy files live in `packages/deploy/`, not `deploy/`.
- Same reason: Dependabot's config must sit at `.github/dependabot.yml`, which is outside those paths. It is at `packages/deploy/dependabot.yml`, to be moved by hand.
- `gh` is not installed, so the pull request text goes at the end of this file (the plan's fallback).

- Commands are grouped per phase in `rules/src/phases/<phase>.ts`, one `defineCommand` each, not one file per command. Fifty small files added nothing: the phase guard is still declared, never hand-written.
- `ctx.require` is a plain function, `need()`, because TypeScript assertion signatures cannot be called through a contextually typed parameter.
- The Resolution is never stored in state. It is memoised against the state object, and commands that cannot change it carry the memo forward.

- Night positions are the old app's order with gaps, not the official sheet's numbers, so relative order stays identical to the old engine for parity. They can be renumbered in the role files later.
- The old app has 14 jinxes, not the 15 the plan says. All 14 are ported.
- Inboxes keep the full message history; the old app cleared them at dusk.

## Known gaps

## Next step

Stage 4: server.
