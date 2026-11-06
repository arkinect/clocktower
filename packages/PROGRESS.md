# Rewrite progress

Session memory for the plan in `docs/rewrite/PLAN.md` (the working copy this session followed is `rebuild.md`, same substance).

## Stage status

| Stage                  | Status      | Gate                                              |
| ---------------------- | ----------- | ------------------------------------------------- |
| 0 Foundations          | done        | passed, CI green                                  |
| 1 Rules core           | done        | passed                                            |
| 2 Framework            | done        | passed locally, see below                         |
| 3 All roles            | done        | passed, a format failure in CI fixed with Stage 4 |
| 4 Server               | done        | passed, CI checked at gate                        |
| 5 Player app           | done        | passed, CI checked at gate                        |
| 6 Storyteller          | done        | passed, CI checked at gate                        |
| 7 Deploy files         | done        | passed locally, nothing deployed or published     |
| 8 Playtest and cutover | not started | for people, not this session                      |

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

### Stage 7

- Files are in `packages/deploy/`, and `.github/workflows/next.yml`. Written, never run.
- `docker build` passes, including the type check, boundaries and tests inside the build (50 fuzz games there).
- `docker compose config` passes for both compose files. `caddy validate` passes, run from the `caddy:2-alpine` image.
- Load test against the built container behind a real Caddy, read-only root filesystem, non-root: 65,000 wrong-password joins and 1,700 refused sockets with a scripted game running. p50 13ms, p95 25ms, max 43ms. Limit 250ms.
- Through Caddy: `/api/status` answers 404, and inside the container it answers. CSP, nosniff and Referrer-Policy reach the client. Assets are cached for a year, and the page itself is not.
- `update.sh` passed `sh -n` only. It has not been run against a real stack.

### After Stage 7

Each change asked for after the stages, on 2026-11-06.

1. **Deployment is a replacement.** `deploy/docker-compose.yml` runs only the app and Caddy on the existing hostname, with one site in the Caddyfile. `update.sh` restarts only that stack, and defers on activity in the last 4 hours. It no longer prunes images, which reached other stacks. The README now says test locally, cut over, roll back by running the previous image tag. `next.yml` also pushes `:sha-<commit>`, because a tag that moves is not something to roll back to. The app stays on its own `clocktower-data` volume: the old app's `data/clocktower.db` has the same name and different tables, so sharing the folder would stop the new app starting. The old `data/` is left alone for a rollback, which needs `CLOCKTOWER_DATA` and `CLOCKTOWER_TRUST_PROXY` as well as the tag.
2. **Sockets are counted inside the `handleUpgrade` callback.** ws skips the callback for a handshake it aborts, so a slot can no longer leak. The new test fails on the old code with a 429.
3. **`socketsPerIp` is 200.** A new test connects 30 sessions from one address.
4. **The per-character pass is done.** All 183 wiki pages were read and `docs/mechanics.md` records what each character needs. It added 19 primitives, starting with `stopsWaking`, each tested in `rules/test/framework/wiki-pass.test.ts` with throwaway characters. The console can now record who voted and a Storyteller nomination, which two of them need.
5. **Travellers no longer count** for the Scarlet Woman's threshold or the official evil information. See `docs/rulings.md`.
6. **`followUpExtensionSeconds` works.** It extends the deadline the first time a night has follow-up questions, once a night. `ENGINE_VERSION` is 2 for this and for `tiedToSource`.
7. **The Grimoire is a circle of seats.** Seat size follows the player count so that seats never overlap, tested for 2 to 30 players. Tapping a seat opens its controls in a sheet.

Checks after these changes: all gates pass, with 250 rules, 37 server, 57 component and 4 browser tests. Parity over 10,000 fuzzed games has no unexplained differences. The built container behind Caddy, flooded as the README says: p95 23ms, max 36ms. `docker compose config` passes with the default and the rollback settings, and `caddy validate` passes. `update.sh` ran against a stand-in for Docker: it defers at 10 idle minutes, restarts at 300, restarts when the app does not answer, and `--force` skips the check. Its status check ran for real inside the container. Neither the cutover nor a rollback has been run.

### Second round of changes

On 2026-11-06.

1. **HSTS is opt-in.** The server no longer sends Strict-Transport-Security unless `HSTS` is `1` or `true`, as the old Caddyfile chose. Tests cover it absent by default, even with secure cookies, and present when on. It never covers subdomains.
2. **Release flow for after cutover.** `next.yml` now also publishes `:<version>` and `:latest` from `packages/deploy/Dockerfile` on version tags, and rebuilds the newest tag every Tuesday. The compose file defaults to `:latest`. The README names `v0.4.2` as the old app's last release (`:0.4.2` is in the registry) and lists what happens to each old workflow.
3. **`playersPerGame` is 30.**
4. **`stopsWaking` applies only when the night resolves.** A stopped Demon keeps their picker, is waited for, and has their choice ignored. This replaces the behaviour in the known limit recorded earlier.
5. **Cut-over steps.** The README now replaces the cron line that ran the old `scripts/update.sh`, and says to merge the server's existing Caddyfile rather than overwrite it.

Checks after these changes: all gates pass, with 251 rules, 39 server, 57 component and 4 browser tests. The three `stopsWaking` tests fail on the old code. `next.yml` passes actionlint. The release and weekly jobs have not run.

## Deviations

- `GET /api/g/:code/names` reads the site password from an `X-Site-Password` header. The plan only says GET; a query string would put the password in logs and history.
- `TRUST_PROXY` is now a list of addresses or hostnames (resolved at boot and every minute), since the plan needs the peer compared with the configured Caddy address. The old app treated it as a flag.
- Added to the plan: `GET /api/g/:code/session`, for a phone to learn who its HttpOnly cookie makes it. A game with no sockets and six idle hours gives up its slot when a fifth game wants one, or abandoned codes would hold all four slots until a restart.
- The welcome message also carries the jinx list, for the Roles tab. Jinxes are not in the view.
- The Night order tab lists roles from the catalog's numbers, without the old list's "Minion info" and "Demon info" steps, which are not roles.
- The theme follows the phone's setting. There is no in-app switch. The old app was dark only.
- The idle games keep one plain stylesheet, `games/games.css`, ported from the old client rather than a CSS module per component. It loads only with their chunk.
- A request with no password at all gets a 401 without starting the backoff, so a phone can find out it needs one.
- The Log tab reads the export endpoint, not StorytellerView, because the view does not carry the command log. Its Report a problem button downloads the same export. Everything else in the console reads the view.
- The console's Grimoire lists seats in order as cards, rather than drawing a round circle.
- The follow-up extension differs from the old app in two ways, as a ruling: it also fires when a decision brings the first question, and it does not fire again after reopening collecting.
- The release flow lives in `next.yml`, not a new workflow file, because this session may commit only the two new workflows and may not edit the old ones. Its release job refuses a tag while `release.yml` or `refresh.yml` exist, and the weekly run skips, because until they are deleted they own those tags, and the old tags have no `packages/deploy/Dockerfile` to build. The first version tag must sort above `v0.4.2`.
- Stage 7 files live in `packages/deploy/`, not a top-level `deploy/`, because this session may commit only under `packages/`, `docs/` and the two workflow files.
- The compose file there replaces the root one. The root file is untouched, so `README.md` in that folder has the steps to cut over: stop the old stack first, since container names and ports are shared.
- The Report a problem button is on the console's Log tab.
- The image build copies `shared/` and `server/src/engine` for the parity tests, in the build stage only. Those lines go at cutover.
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

## Next step

Stage 8, by people: test locally, cut over, playtest. See `deploy/README.md` and the plan.

## Pull request text

gh is not installed here, so no pull request was opened. Open one from `rewrite/session-1` to `main` with this text.

**Title:** Rewrite as four packages, Stages 0 to 7

The app rebuilt under `packages/` to replace the old one on its hostname, around a pure rules engine where each character is one file. Nothing under the old app changed, and nothing has been deployed or published.

**Done**

- Stage 0: monorepo, tooling, boundary checks, CI.
- Stages 1 to 3: protocol, rules core, ability framework, all 55 roles and 14 jinxes. 251 rules tests. Parity with the old engine over 10,000 fuzzed games, with no unexplained differences.
- Stage 4: server with sessions, limits, persistence and sockets. 39 tests, including a headless full game and the security tests. Under flood, p95 round trip is 12ms directly and 25ms in the container behind Caddy.
- Stage 5: phone app, thin over PlayerView, with the idle games in a lazy chunk. 57 component tests. Playwright plays a full game with five browsers at 360 px in both themes.
- Stage 6: Storyteller console from StorytellerView, with no custom role panels. Playwright runs lobby to publishing night 2 with a changed decision, a stale override and an execution.
- Stage 7: Dockerfile, compose, Caddyfile, `next.yml`, `update.sh`, README. Build, validation and the load test passed locally.
- After Stage 7: replacement deployment, socket slot fix, 200 sockets per address, the per-character pass over all 183 wiki pages with 19 new primitives, Traveller thresholds, follow-up time, and the Grimoire as a circle of seats. See the list above.

**Gates failed:** none at the end. Stage 3 first failed CI on formatting; that was fixed in the Stage 4 commit.

**Not proven**

- No real people have played it. That is the point of Stage 8.
- The browser tests drive a handful of roles. The other roles are covered in the engine tests, not through the console.
- `next.yml` has never run, and neither has the cutover. `update.sh` ran against a stand-in for Docker only.
- The release and weekly jobs in `next.yml` cannot run until cutover, so they have only been linted.
- The 19 new primitives have no real character using them yet: 128 of the 183 characters are unbuilt.
- The parity harness does not compare false suggestions, notices, game-end suggestions or Storyteller edits. See `docs/mechanics.md` and the rulings.

**Left for people (Stage 8):** the local test, deleting `release.yml` and `refresh.yml`, the first release tag, cutover, the playtest and deleting the old code.

Rulings are in `docs/rulings.md`, and deviations from the plan are in `packages/PROGRESS.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
