# Rewrite progress

Session memory for the plan in `docs/rewrite/PLAN.md` (the working copy this session followed is `rebuild.md`, same substance).

## Stage status

| Stage         | Status | Gate                                              |
| ------------- | ------ | ------------------------------------------------- |
| 0 Foundations | done   | passed, CI green                                  |
| 1 Rules core  | done   | passed                                            |
| 2 Framework   | done   | passed locally, see below                         |
| 3 All roles   | done   | passed, a format failure in CI fixed with Stage 4 |
| 4 Server      | done   | passed, CI checked at gate                        |
| 5 Player app  | done   | passed, CI checked at gate                        |
| 6 Storyteller | done   | passed locally, see below                         |

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

### Stage 4

- Headless game over real sockets, lobby to ended with real characters: `server/test/game.test.ts`.
- Security tests in `server/test/security.test.ts`: no token in view, export, log or database; wrong Origin refused; spoofed X-Forwarded-For from a non-Caddy peer ignored; backoff grows and resets; exposed without a password refuses to start. Also socket caps, payload cap, message rate, stale phones, bounded queue, CSP and body caps.
- Load test, `npm run load -w @ct/server` against the built bundle: 50 connections flooding join (about 8,000 requests a second, all but one refused) and 31,000 refused sockets, while a scripted game ran. p50 6ms, p95 12ms, max 62ms. Limit 250ms. Run on this machine, without Caddy; repeat it behind Caddy in Stage 7 if available.
- Restart restores games and sessions. Another engine version, or a snapshot failing the schema, is archived and a fresh lobby starts.
- `rules/test/core/schema.test.ts` hashes the GameState schema against ENGINE_VERSION.

### Stage 5

- Picker component tests cover all three field kinds, distinct and decline: `web/test/picker.test.tsx`.
- Playwright (`web/e2e/player.spec.ts`, added to CI): five browser contexts and a scripted Storyteller play to the end against the built bundle, at 360 px with no side scroll, in both themes, with no console or CSP errors. The games chunk is checked to load only after submitting. Reload, keyboard join and rejoin are covered too.
- `web/test/tokens.test.ts` checks text contrast of at least 4.5:1 in both themes.

### Stage 6

- `web/src/storyteller/`: lobby, setup, night, review, day, grimoire, story, log and a reference tab. Every panel renders StorytellerView only, and boundaries keep `web` out of `rules`.
- Playwright (`web/e2e/storyteller.spec.ts`): lobby to publishing night 2 from the console, with a Slayer day action previewed and accepted, a nomination, a vote, an execution, a changed decision, a stale override kept by hand, and no console errors. Every tab has no side scroll at 360 px. An early flake, where the Storyteller checkbox did not appear, came from the per-address limit: the whole test suite shares one address, so names requests got a 429 and the Join screen had no name data. A real table shares an address too, so the limit went up (5 a second, burst 60) and Join now retries when the server is busy.
- `docs/role-panels.md`: no custom panels.
- The full game gate ("any of the 55 roles") rests on the generic panels. The browser test drives Balloonist, Slayer, Empath, Poisoner and Imp, not all 55.

## Deviations

- `GET /api/g/:code/names` reads the site password from an `X-Site-Password` header. The plan only says GET; a query string would put the password in logs and history.
- `TRUST_PROXY` is now a list of addresses or hostnames (resolved at boot), since the plan needs the peer compared with the configured Caddy address. The old app treated it as a flag.
- Added to the plan: `GET /api/g/:code/session`, for a phone to learn who its HttpOnly cookie makes it. A game with no sockets and six idle hours gives up its slot when a fifth game wants one, or abandoned codes would hold all four slots until a restart.
- The welcome message also carries the jinx list, for the Roles tab. Jinxes are not in the view.
- The Night order tab lists roles from the catalog's numbers, without the old list's "Minion info" and "Demon info" steps, which are not roles.
- The theme follows the phone's setting. There is no in-app switch. The old app was dark only.
- The idle games keep one plain stylesheet, `games/games.css`, ported from the old client rather than a CSS module per component. It loads only with their chunk.
- A request with no password at all gets a 401 without starting the backoff, so a phone can find out it needs one.
- The Log tab reads the export endpoint, not StorytellerView, because the view does not carry the command log. Its Report a problem button downloads the same export. Everything else in the console reads the view.
- The console's Grimoire lists seats in order as cards, rather than drawing a round circle.
- Per-request logging is off altogether, so addresses and URLs stay out of the logs. Each command logs the player id and command type.
- `@fastify/static` is imported only when there is a client directory. Its dependencies are ES modules that `require` cannot load on this machine's Node 22.7; the esbuild bundle and newer Node are unaffected.
- Server messages past the socket rate limit are dropped with no ack, as the limit is there to shed work. The client treats a missing ack as a timeout.

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

- If Caddy is restarted with a new container address, `TRUST_PROXY` resolved at boot goes stale and every client looks like one address until this server restarts. Give Caddy a fixed address or restart both.

## Next step

Stage 7: deploy files.
