# Rewrite progress

Session memory for the plan in `docs/rewrite/PLAN.md` (the working copy this session followed is `rebuild.md`, same substance).

## Stage status

| Stage         | Status | Gate                      |
| ------------- | ------ | ------------------------- |
| 0 Foundations | done   | passed, CI green          |
| 1 Rules core  | done   | passed locally, see below |

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

## Deviations

- zod 4 and @fastify/static 10 rather than the versions first picked: `npm audit --omit=dev` is a CI step and the older versions fail it.
- `@ct/rules` depends on zod directly, for the GameState schema (the plan lists protocol and immer).
- Rule 4 limits commits to packages/, docs/ and the two workflow files, and overrides the plan's layout, so deploy files live in `packages/deploy/`, not `deploy/`.
- Same reason: Dependabot's config must sit at `.github/dependabot.yml`, which is outside those paths. It is at `packages/deploy/dependabot.yml`, to be moved by hand.
- `gh` is not installed, so the pull request text goes at the end of this file (the plan's fallback).

- Commands are grouped per phase in `rules/src/phases/<phase>.ts`, one `defineCommand` each, not one file per command. Fifty small files added nothing: the phase guard is still declared, never hand-written.
- `ctx.require` is a plain function, `need()`, because TypeScript assertion signatures cannot be called through a contextually typed parameter.
- The Resolution is never stored in state. It is memoised against the state object, and commands that cannot change it carry the memo forward.

## Known gaps

## Next step

Stage 2: ability framework, docs/mechanics.md, eight acceptance roles.
