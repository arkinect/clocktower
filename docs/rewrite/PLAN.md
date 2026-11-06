# Clocktower Rewrite Plan

Plan as of Nov 5, 2026. Source of truth for the rewrite; keep it in sync if the plan changes.

## Overview

We rebuild the app as four packages around a pure rules engine in which every character is one file and the core never names one. The framework carries, from day one, the general mechanics that official characters rely on, and all 55 current roles are built on it in one dependency-ordered pass. Stages 0 to 7 run as one unattended Claude Code session of about 8 hours; people then deploy, playtest and cut over.

### At a glance

Stages 0 to 7 run back to back in one Claude Code session, each starting when the one before passes its gate. Stage 8 is done by people afterwards.

- **Stage 0, Foundations:** monorepo, CI, boundary checks.
- **Stage 1, Protocol and rules core:** schemas, phases, commands, views; a full game with no abilities.
- **Stage 2, Ability framework:** every mechanic in the coverage table, proven by eight hard roles.
- **Stage 3, All 55 roles:** simplest hooks first, jinxes last, checked against the old engine.
- **Stage 4, Server:** sessions, sockets, persistence, abuse and denial-of-service limits.
- **Stage 5, Player app:** client foundations, every player screen, mini-games.
- **Stage 6, Storyteller app:** a console driven by data the roles declare.
- **Stage 7, Deploy as :next:** container and compose files for the existing Caddy setup, load test.
- **Stage 8, Playtest and cutover:** by people after the session: real games, then switch and delete the old code.

The current app works and its central idea is right: night resolution is a pure, deterministic function that re-runs whenever the Storyteller changes a choice. What failed is containment. Passive and reactive abilities were patched into the core (kill pipeline, impairment, death, publish), so adding a role touches five to eight files, and role-specific fields leak into shared state and the client.

### Goals

- Any official character can be added later without a rewrite. The framework has every general mechanic they rely on (character and alignment change, Travellers, Fabled and Loric, madness, full registration, game-end checks), each with a framework test, even where no current role uses it.
- Adding a role means adding one file and its tests. The core, protocol and client need no change unless the role needs a new kind of hook or a custom panel.
- Philosopher, Cannibal, Drunk, Marionette and Lil' Monsta fall out of the data model (abilities separate from characters) instead of special cases.
- One definition per contract: command and view schemas are written once and give both TypeScript types and runtime validation.
- The client never sees raw engine state. Each side gets a view built for its screens.
- Resistant to outside attackers, including denial of service from the internet: a hardened Caddy front end, application-level limits, no secrets in URLs or views, hashed sessions, hard resource limits, a hardened container.
- Every game can be exported as a command log and replayed exactly, for bug reports and tests.

### Non-goals

- Preventing cheating by players. Anyone may take the Storyteller seat or rejoin as any player; players are trusted.
- Keeping a game alive across an app update. An update may end the game in progress.
- Migrating saved games from the current app.
- Accounts, multiple Storytellers, or public hosting for strangers.

### Decisions already made

| Topic | Decision |
| --- | --- |
| Scope of the build | All 55 current roles, on a framework that covers the mechanics of every official character |
| Who builds it | One unattended Claude Code session of about 8 hours for stages 0 to 7; people do stage 8 |
| Order | Build dependency, not what ships first |
| Where the code lives | `packages/`, its own npm root beside the old app; the session works on a branch and opens a pull request |
| Release gate | One playtest before cutover; parity checked by differential tests against the old engine |
| Persistence across updates | Not required; a snapshot that fails the version or schema check is archived and a fresh lobby starts |
| Storyteller access | Anyone can take it; no PIN |
| Security focus | Outside attackers, including denial of service; not cheating by players |
| Internet exposure | As today: Caddy with automatic HTTPS on forwarded ports 80 and 443, site password required; no Cloudflare |
| Evil information | House rule by default (Minions learn each other, not the Demon); the official rule is a setting |
| Mini-games | Ported in stage 5 |
| Stack | TypeScript, React, Fastify, SQLite, as today |
| Domain model | Player identity, true character, self-knowledge and ability instances kept separate |

### Principles

1. The rules engine is pure: no I/O, no clock, no `Math.random`. Time and seeds come in with each command.
2. The core dispatches to hooks on ability instances. A role id string in core code fails review (and a lint rule).
3. State is typed all the way down. No `Record<string, unknown>` bags, no ids packed into strings and sliced apart.
4. Derived facts (impairment, registration, alive sets) are computed once per pass and passed down.
5. Rules rulings live next to the role that needs them, with a test named after the ruling.

## Running this plan in Claude Code

One unattended Claude Code session builds stages 0 to 7 on a branch, then stops and opens a pull request. Deploying, the playtest and cutover (stage 8) are done by people. This section is the session's operating brief; it overrides anything later in the plan that conflicts with it.

### Done for this session means

- Stages 0 to 6 complete, each exit gate passed and recorded in `packages/PROGRESS.md`.
- Stage 7's files written and checked locally (`docker build` if Docker is available). Nothing deployed or published.
- All work committed on branch `rewrite/session-1` with the new CI green, and a pull request to `main` describing what was done, which gates failed and what is left. If `gh` is unavailable, the pull request text goes at the end of `PROGRESS.md`.
- Partial completion is acceptable. The old app keeps running, so an unfinished stage delays cutover and breaks nothing.

### Ground rules

1. **Read first.** This plan, then the current behaviour: `design.md`, `shared/src/roles.ts` (ability texts, night orders, jinxes), `server/src/engine/` and `server/test/`. Run the old tests once (`npm test -w server` from the repo root) and record the result as the baseline.
2. **The old app is read-only.** Do not modify `shared/`, `server/`, `client/`, the root `package.json` and `package-lock.json`, `Dockerfile`, `docker-compose.yml`, `caddy/`, `scripts/`, `design.md` or the existing workflows. The parity harness imports the old engine; it never edits it.
3. **`packages/` is its own npm root**, with its own `package.json`, workspaces and lockfile, so the old Dockerfile and CI keep working. New CI goes in `.github/workflows/rewrite.yml`, triggered by changes under `packages/**`.
4. **Never** push to `main`, force-push, tag, publish images, deploy, or touch `data/` or `.env`. Create the branch from `origin/main`, not from the local working tree. Commit only paths under `packages/`, `docs/` and the two new workflow files, adding them by path (never `git add -A`), and delete nothing outside them.
5. **Gate discipline.** Start a stage only when the previous gate passes. Commit at least at every gate (`Stage N: <summary>`), with smaller commits in between, and push the branch after each gate.
6. **Don't stop to ask.** Where the plan, the old app and the official rules disagree, follow the old app unless it is clearly a bug, record a ruling in `docs/rulings.md`, and carry on. Where the plan is silent, take the most reasonable reading and log it under Deviations in `PROGRESS.md`.
7. **`packages/PROGRESS.md` is the session's memory.** Keep stage status, gate results, rulings, deviations, known gaps and the next step there. Update it at every gate and before any long task, so work resumes cleanly after context compaction.
8. **No fake passes.** If a gate cannot pass, record why, make the smallest change that unblocks later stages, and mark the gate failed. No skipped or deleted tests, no `any` or `@ts-ignore` to silence errors.
9. **Subagents are allowed for stage 3.** Role batches can be split across subagents, each owning whole role files and their tests. The main session merges and runs the parity harness.

### Time budget

| Stage | Budget |
| --- | --- |
| 0 Foundations | 20 min |
| 1 Protocol and rules core | 50 min |
| 2 Ability framework | 90 min |
| 3 All 55 roles | 150 min |
| 4 Server | 60 min |
| 5 Client foundations and player app | 45 min |
| 6 Storyteller app | 50 min |
| 7 Deploy files | 15 min |

When stage 3 reaches its budget, finish the current batch, list the remaining roles in `PROGRESS.md`, and move to stage 4; come back to them after stage 6 if time remains. When any other stage overruns by half its budget, cut in this order, logging each cut: the stage 7 load test (keep the files), Playwright tests (keep component tests), the story and log screens. Never cut the boundary checks, the hidden-information invariants, the stage 4 security tests or the parity harness.

### Environment

- Node 22 and npm. `better-sqlite3` builds natively and needs a compiler toolchain.
- Install Playwright's Chromium with `npx playwright install chromium` if it is missing.
- If Docker is unavailable, stage 7 skips `docker build` and logs it.
- If web access is unavailable for stage 2's design pass, work from the official character list as known and log that.

### Kickoff prompt

```
Read docs/rewrite/PLAN.md in full. Execute it as its section "Running this plan in Claude Code" describes:
stages 0 to 7, on branch rewrite/session-1, unattended. Do not ask me questions; record decisions in
packages/PROGRESS.md and docs/rulings.md. Stop after stage 7 and open a pull request to main that
summarises what was done, which gates failed, and what is left.
```

## Target architecture

Four packages with one-way dependencies: `protocol` is the contract, `rules` is the game, `server` hosts it, `web` draws it. The web client depends only on `protocol`, so it can never reach into engine internals.

```
            @ct/server ──imports──▶ @ct/rules
                │                      │
             imports                imports
                ▼                      ▼
  @ct/web ──imports──▶ @ct/protocol ◀──┘
     ▲
     └── talks to @ct/server over HTTP and WebSocket at runtime (never imports it)
```

Arrows point from a package to what it imports; any other import fails CI. The browser reaches the engine only through the server.

| Package | Holds | Depends on | Must not contain |
| --- | --- | --- | --- |
| `@ct/protocol` | Zod schemas for commands, views, socket messages; branded id types | zod | Game logic |
| `@ct/rules` | Game model, phase machine, command handlers, ability framework, night resolution, roles, jinxes, view projections | protocol, immer | I/O, clock, randomness, Node or browser APIs |
| `@ct/server` | HTTP and socket transport, sessions, password gate, game manager, SQLite store | rules, protocol, fastify, ws, better-sqlite3 | Rules logic, role ids |
| `@ct/web` | Player and Storyteller apps | protocol, react | Imports from rules or server |

Role display data (name, ability text, type, night position) is written once, in the role's file in `rules`. The server sends the script's role cards to clients when they connect, so the client never needs its own copy.

The boundaries are enforced by tooling, not convention:

- A dependency-cruiser rule fails CI if `web` imports `rules` or `server`, or if `rules` imports a Node built-in.
- `RoleId` is a branded type. Only `rules/src/roles` and `rules/src/jinxes` may call its constructor, `roleId('empath')`, and a lint rule bans the call anywhere else. Condition types keep their official names (`drunk`, `poisoned`), which are plain string literals of a different type, so the two never collide.
- `Date.now`, `Math.random` and `crypto` are banned inside `rules` by lint; time and seeds arrive with each command.

### Repository layout

```
clocktower/
  shared/ server/ client/  # the current app, untouched until cutover
  packages/
    protocol/src/
      ids.ts            # PlayerId, AbilityId, RoleId (branded strings)
      commands.ts       # one zod schema per command, discriminated on `type`
      views.ts          # PlayerView, StorytellerView, RoleCard, ActionSpec, DayActionSpec
      socket.ts         # client <-> server messages, with request ids
    rules/src/
      model/            # GameState, Player, Seat, AbilityInstance, Condition, DayEvent, Decision
      phases/           # lobby, setup, night, day, ended: legal commands + one handler file each
      abilities/        # defineRole, registry, grant/revoke/move, character and alignment change
      derive/           # staged impairment, registration, visibility, alive sets
      setup/            # setup rules as data: counts, Demon count, seating constraints, bag tokens
      night/            # wake list, evil info, NightContext, kill pipeline, death triggers, questions
      day/              # day events: nominations, votes, executions, exiles, statements, madness
      game/             # game-wide hooks: checkGameEnd, transformInfo, Travellers, Fabled, Loric
      views/            # player and Storyteller projections (the hidden-information boundary)
      roles/            # townsfolk/ outsiders/ minions/ demons/ travellers/ fabled/ loric/
      jinxes/           # one file per jinx pair
      index.ts          # createGame, dispatch, project
    rules/test/
      scenario.ts       # scenario test language
      framework/        # one test per mechanic, with throwaway test characters
      roles/            # one test file per role
      invariants/       # fuzzed full games
      parity/           # differential runner against the old engine (deleted at cutover)
    server/src/
      http/  ws/  auth/  limits/  games/  store/  config.ts  main.ts
    web/src/
      app/              # routing, providers, socket store
      ui/               # shared components and design tokens
      features/join/  features/player/  features/storyteller/  features/idle-games/
      role-panels/      # rare custom Storyteller panels, keyed by role id
  docs/
    architecture.md  rulings.md  adding-a-role.md  mechanics.md  role-panels.md
  deploy/
    Dockerfile  docker-compose.yml  Caddyfile  update.sh
```

## Domain model

A player's identity, true character, self-knowledge and abilities are four separate things, and an ability can also be held by the Storyteller or the game. The engine only ever iterates ability instances, which is what makes gained, eaten, believed, moving and Storyteller-held abilities ordinary.

### Core types

```ts
type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller' | 'fabled' | 'loric';

interface GameState {
  version: EngineVersion;          // bumped by hand when the state schema changes
  id: GameId;  code: string;  createdAt: number;  seq: number;
  phase: Phase;                    // discriminated union, below
  players: Record<PlayerId, Player>;
  storytellerId: PlayerId | null;
  seats: Seat[];                   // clockwise; Travellers add and remove seats mid-game
  script: RoleId[];
  storytellerCharacters: RoleId[]; // Fabled and Loric in play (Loric fixed at setup)
  abilities: Record<AbilityId, AbilityInstance>;   // one game-wide table
  conditions: Condition[];         // the reminder tokens
  setup: { bluffs: RoleId[]; bag: Record<PlayerId, RoleId>; rules: SetupRules };
  events: GameEvent[];             // nominations, votes, executions, exiles, statements, night records
  inbox: Record<PlayerId, Message[]>;
  settings: Settings;              // includes evilInfoPolicy (see stage 2)
}

interface Seat { playerId: PlayerId; joined: Moment; left: Moment | null }

interface Player {
  id: PlayerId;  name: string;
  life: { alive: boolean; diedAt: Moment | null; cause: DeathCause | null; ghostVoteUsed: boolean };
  removal: { kind: 'exiled' | 'left'; at: Moment } | null;   // Travellers
  character: RoleId | null;        // the token in the grimoire
  alignment: Alignment;            // true alignment, changed only by changeAlignment
  self: { character: RoleId | null; alignment: Alignment };  // what they were told
  history: (CharacterChange | AlignmentChange)[];
}

type Holder = { kind: 'player'; id: PlayerId } | { kind: 'storyteller' } | { kind: 'game' };

interface AbilityInstance<S = unknown> {
  id: AbilityId;
  roleId: RoleId;                  // which ability definition runs
  holder: Holder;                  // changes when an ability moves (Lil' Monsta)
  origin: { kind: 'character' } | { kind: 'granted'; by: AbilityId } | { kind: 'storyteller' };
  shownAs: RoleId | null;          // what the holder sees it called; null = hidden
  perceivedOnly: boolean;          // holder thinks they have it; it does nothing (Lunatic)
  activeFrom: Moment;
  activeUntil: Expiry | null;
  state: S;                        // typed per role: used, lastTarget, word, kills
}

interface Condition {
  id: ConditionId;
  type: 'drunk' | 'poisoned' | 'protected' | 'mad' | 'marker';   // marker = a named reminder with no core meaning
  name?: string;  data?: unknown;  // e.g. mad: { about: RoleId }
  target: PlayerId;
  source: { kind: 'ability'; id: AbilityId } | { kind: 'storyteller' };
  until: Expiry;                   // 'dusk' | 'source_acts_again' | 'while_source_works' | 'removed' | 'event'
  since: Moment;
}

interface Registration { character: RoleId; type: CharacterType; alignment: Alignment; alive: boolean }

type Moment = { kind: 'night' | 'day'; n: number };
```

### Phases carry their own data

```ts
type Phase =
  | { kind: 'lobby' }
  | { kind: 'setup' }
  | { kind: 'night'; n: number; stage: 'briefing' | 'collecting' | 'review';
      deadline: number | null;     // advisory only, see stage 1
      seed: Seed;
      submissions: Record<PlayerId, Submission>;
      decisions: Record<DecisionKeyHash, { key: DecisionKey; option: OptionId }>;
      overrides: Record<ResultKey, { lines: string[]; writtenAgainst: string[] }>;
      answers: Record<QuestionKey, Answer> }
  | { kind: 'day'; n: number }
  | { kind: 'ended'; reason: 'storyteller' | 'update'; winner: Alignment | null };
```

Night data exists only inside a night phase, so handlers never write `state.night!`. Day happenings are events in `events`, so hooks can react to them and the story view reads them back.

### How the hard cases come out

| Case | Character / alignment | Self | Abilities held | Conditions |
| --- | --- | --- | --- | --- |
| Drunk who thinks they are the Empath | Drunk / good | Empath / good | Empath, from character | drunk, from the Drunk's character, until removed |
| Marionette | Marionette / evil | a Townsfolk / good | that Townsfolk, from character | drunk, until removed |
| Philosopher picks Fortune Teller; a real FT is in play | unchanged | unchanged | Philosopher (used) + Fortune Teller, granted by Philosopher | the real FT is drunk while the Philosopher's ability works |
| Cannibal eats the Butler | unchanged | unchanged | + Butler, granted by Cannibal, shown as Butler (jinx) | none |
| Cannibal eats an evil player | unchanged | unchanged | + a good ability the Storyteller picks, shown as Cannibal | poisoned, from Cannibal, until a good player is executed |
| Lil' Monsta | the chosen Minion | same | Minion ability + Lil' Monsta token, moving between Minions | none |
| Scarlet Woman becomes the Imp | Imp | Imp | character abilities replaced; granted ones kept | none |
| A future Pit-Hag turns a player into a Demon | changed on the target | told the new character | target's character abilities replaced | none |
| A Traveller joins on day 2 | Traveller / set by Storyteller | same, public to all | Traveller ability | none; a seat is added |
| A Fabled is added | no player | n/a | ability held by the Storyteller | none |

Most "fake ability" cases are impairment cases. The Drunk, the Marionette and the evil-eating Cannibal hold a real ability instance and are drunk or poisoned, so the normal impaired path suggests false information. Only roles like the Lunatic need `perceivedOnly`.

### Rules the model enforces

- Impairment applies to the player. Every ability they hold fails together. Storyteller- and game-held abilities are never impaired.
- `changeCharacter(target, role)` works on any player, by any ability. It replaces the target's abilities with `origin: character`, resets their state and records history. Granted abilities stay unless the ability definition says otherwise. Making or replacing a Demon is the same operation.
- `changeAlignment(target, alignment)` is a separate operation with its own history entry.
- Per-role memory lives on the ability instance. Today's `SetupState` and `DayRecord` role fields (Mezepheles word, Shabaloth kills, Damsel guess, Juggler count, Gossip statement) all move onto the relevant instance or into day events.
- Neighbour and seat-distance queries walk `seats`, skipping departed Travellers; dead players keep their seat.
- Registration is answered per query by `ctx.registers(subject)`, which runs the subject's `registersAs` hooks. Each non-truthful answer is a Storyteller decision. Nothing about registration is stored on the player.

### Impairment is staged, as today

Impairment is computed once per pass in three fixed stages, matching the current two-pass logic in `impairment.ts`:

1. **Base:** conditions with no source dependency, plus conditions a character puts on its own holder (Drunk, Marionette).
2. **Source-dependent:** `while_source_works` conditions (the Philosopher's drunk) are active if the source's holder is alive and not impaired in stage 1.
3. **Derived:** `deriveConditions` hooks (No Dashii, Vigormortis) add conditions, their sources judged against stage 1.

Stages 2 and 3 never feed back into each other, so mutual dependencies have exactly one answer. A framework test pins that rule.

### Storyteller decisions

Every choice the Storyteller can make during review goes through one primitive:

```ts
ctx.decide<T extends string>({
  key: { kind: 'mayor_bounce', ability: mayorAbilityId, subject: attackerAbilityId },  // night is added by the context
  title, description,
  options: { id: T; label: string }[],
  default: T,
}): T
```

A decision is keyed by what is decided (night, ability, kind, subject), never by how far the walk got, so changing an earlier decision cannot shift later answers onto the wrong question. Options carry typed ids, never `redirect:${id}` strings. Changing a decision re-runs the night. Review marks as stale any recorded decision the re-run no longer asks, and any override whose true lines differ from the ones it was written against.

### What a player may see

A player view shows another player's hidden data only through three paths: a message the engine delivered to that player (start information, evil information, results), a public fact (deaths, Traveller characters, announced events), or a visibility grant from an ability the viewer holds (a future Spy or Widow). The view invariant checks exactly these paths.

## Mechanics coverage

Every general mechanic below exists from stage 2, each with a framework test written against throwaway test characters, whether or not a current role uses it. Adding a future official character should then mean writing its file, not changing the core.

The table is the starting point for stage 2's design pass over the [wiki's character list](https://wiki.bloodontheclocktower.com/Character_Types). Any mechanic that pass finds with no row gets a primitive and a test before the hook API is frozen. Future characters are named only to show what each row is for.

| Mechanic | Primitive | Current roles | Future characters |
| --- | --- | --- | --- |
| Character change on any player | `changeCharacter(target, role)` | Scarlet Woman, Farmer, Huntsman and Damsel, Imp starpass | Pit-Hag, Barber, Hatter, Engineer |
| Alignment change | `changeAlignment(target, alignment)` | Goon, Mezepheles | Cult Leader |
| Gained, hidden and moving abilities | `grant`, `move`, `shownAs` | Philosopher, Cannibal, Lil' Monsta | Boffin |
| Believed-only ability | `perceivedOnly` | none | Lunatic |
| Abilities with no player holder | holder is Storyteller or game | none | Fabled, Loric |
| Travellers | public character, Storyteller-set alignment, seats added and removed, exile | none | all Travellers |
| Full registration | `registersAs` returns character, type, alignment, alive | Recluse | Spy, Zombuul |
| Setup rules as data | type counts, Demon count from zero up, seating constraints, bag token vs character | Baron, Balloonist, Godfather, Huntsman, Drunk, Marionette | Atheist, Legion, Riot, Kazali, Lord of Typhon, Lunatic, Hermit |
| Evil information | evil-info step, `modifyEvilInfo` | Demon, Minions, Marionette, Lil' Monsta | Magician, Poppy Grower |
| Day events with hooks | nomination, vote, execution, exile, recorded statement | Virgin, Witch, Golem, Mezepheles, Gossip, Juggler | Princess, Vizier, Riot, Goblin |
| Game end | `checkGameEnd` suggests a winner and reason; Storyteller confirms | Mayor, Mastermind | Saint, Evil Twin, Vortox, Heretic |
| Information transform | `transformInfo` over every result | none | Vortox |
| Visibility grants | `visibility` lets an ability see grimoire data | none | Spy, Widow |
| Madness | `mad` condition, `broke_madness` event, Storyteller ruling | none | Cerenovus, Harpy, Mutant |
| Kill interception and redirect | `interceptKill` by priority | Sailor, Innkeeper, Tea Lady, Fool, Mayor | Monk, Soldier |
| Death and execution triggers | `onDeath`, `onExecution` | Scarlet Woman, Ravenkeeper, Farmer, Grandmother, Cannibal | many |
| Derived conditions | `deriveConditions` | No Dashii, Vigormortis | none named |
| Questions to other players | `ctx.ask` | Ravenkeeper, Al-Hadikhia | many |
| Malfunction log | `ctx.malfunction` | Mathematician | none named |
| Night order | official numeric positions with gaps | all | all |

## Stage 0: Repo and tooling foundations

Stage 0 produces an empty but fully wired monorepo whose CI already enforces the package boundaries, so nothing written later can drift across them.

The rewrite lives in a fresh `packages/` tree on `main`, beside the current `shared/`, `server/` and `client/`, which keep serving games until cutover. The trees share no files, so there are no merge conflicts, and the old engine stays importable for the differential parity tests in stage 3.

### Work

1. `packages/` is its own npm root: `packages/package.json` with workspaces for the four packages, its own lockfile, TypeScript project references, one `tsconfig.base.json`. The root `package.json`, lockfile and Dockerfile stay untouched, so the old app's build and CI keep working.
2. Compiler settings: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`.
3. ESLint (typescript-eslint, strict) and Prettier. No long-line style: the formatter wraps at 120.
4. Boundary rules (dependency-cruiser): `web` may import only `protocol`; `rules` may not import Node built-ins, `Date.now` or `Math.random`; the RoleId constructor callable only under `rules/src/roles` and `rules/src/jinxes`.
5. Vitest in every package, with coverage reported (not gated) in CI.
6. CI in a new workflow, `.github/workflows/rewrite.yml`, triggered by changes under `packages/**`: install, typecheck, lint, boundary check, test, build, `npm audit --omit=dev`. Dependabot for the new lockfile.
7. A dev container or `dev.sh` so the native `better-sqlite3` build works the same on Windows, macOS and Linux.
8. `packages/PROGRESS.md` (the session log), `docs/architecture.md` (this plan, condensed), `docs/rulings.md`, `docs/adding-a-role.md` stub.

### Exit gate

- CI is green on the empty packages.
- A deliberately bad import (`web` importing `rules`) and a RoleId constructor call in `rules/src/night` both fail CI.
- `npm run dev` starts server and client together with hot reload.

## Stage 1: Protocol and rules core

Stage 1 delivers the protocol package and a complete game loop with no abilities at all: join, seat, assign characters, run nights that wake nobody, publish dawn, record day events and end. Every later stage plugs into this skeleton.

### Protocol first

`@ct/protocol` is written at the start of this stage, because dispatch validates against it and projections return its views:

- `ids.ts`: branded `PlayerId`, `AbilityId`, `RoleId`, `GameId`.
- `commands.ts`: one zod schema per command, string length and array size limits included; `Command` is the inferred union.
- `views.ts`: `PlayerView`, `StorytellerView`, `RoleCard`, `ActionSpec`, `DayActionSpec`, `ReviewItem`.

Socket messages are added in stage 4 with the server.

### One command, one file

The 500-line switch is replaced by a registry. Each command declares who may send it and in which phases, and the dispatcher enforces both before the handler runs.

```ts
export default defineCommand({
  type: 'assign_character',
  by: 'storyteller',                    // 'player' | 'storyteller' | 'any'
  phases: ['setup'],                    // narrows ctx.phase for the handler
  schema: AssignCharacter,              // from @ct/protocol
  handle(ctx, cmd) {
    ctx.require(ctx.onScript(cmd.roleId), 'That character is not on the script.');
    ctx.characters.assign(cmd.playerId, cmd.roleId);   // runs the role's setup hook
  },
});
```

- `dispatch(state, actor, command, { now, seed })` returns `{ ok, state, events } | { ok: false, error }`. It validates the schema, checks actor and phase, runs the handler on an immer draft, then runs post-command invariants in tests.
- Handlers live in `phases/<phase>/<command>.ts`. A command legal in several phases lists them all; the phase guard is never written by hand.
- `ctx.require(cond, message)` replaces scattered `return err(...)`. Error messages are user-facing and short.
- The dispatcher appends the command, its time and its seed to the game's command log. Replaying the log through `dispatch` must reproduce the state byte for byte, and a test checks it.

### Phase machine

Transitions are named commands (`open_setup`, `begin_first_night`, `open_collecting`, `close_collecting`, `publish_dawn`, `start_night`, `end_game`, `play_again`). Each lives with the phase it leaves. Storyteller overrides (`force_phase`) remain, but as an explicit command with its own tests, not a back door in every handler.

### Views in this stage

`project(state, viewer)` returns a `PlayerView` or a `StorytellerView`, both defined in `protocol`.

- `PlayerView`: phase, seating, public deaths and public characters (Travellers), own role card, own pickers and questions, own inbox. Other players' hidden data appears only through the three paths in the domain model: delivered messages, public facts, visibility grants.
- `StorytellerView`: a purpose-built grimoire (players with character, alignment, self, abilities, conditions and impairment), plus Storyteller-held abilities, the setup checklist, submission board and review. It never includes session tokens, the command log or raw state.

### Scope

- Lobby: join, rename, remove, claim the Storyteller seat.
- Setup: script, seating, character assignment, type counts and the distribution suggestion, bluffs, the setup checklist.
- Night skeleton: collecting, review with overrides, publish. The wake list is empty until stage 2.
- Countdown: advisory, as today. The Storyteller closes collecting; the engine allows it early only with `force`, and otherwise once `now` is past the deadline. Nothing closes on a timer, because an automatic close would have to be a logged system command for replay to stay exact.
- Day: day events (execution, death, revival), ghost votes, notes.
- Ended and play again (same players, fresh game).

### Exit gate

- A scripted five-player game with ability-less characters runs from lobby to ended in a test.
- Fuzz test: 1,000 random command sequences never throw, and every player view passes the hidden-information check (stage 3 adds the full invariant set).
- Command-log replay reproduces the final state exactly.

## Stage 2: Ability framework and night resolution

Stage 2 builds the hook system and every mechanic in the coverage table, then proves it with the eight hardest current roles, merged on `main` as the framework's acceptance tests. It is the stage that decides whether the rewrite succeeds.

### Design pass first

One to two hours before any hook code: walk the wiki's full character list (including Travellers, Fabled and Loric) and note the kinds of mechanic each relies on, not the characters. Extend the Mechanics coverage table with anything missing and save it as `docs/mechanics.md`. Each row becomes a framework test.

### A role is one file

```ts
export const empath = defineRole({
  id: roleId('empath'), name: 'Empath', type: 'townsfolk',
  abilityText: 'Each night, you learn how many of your 2 alive neighbours are evil.',
  night: { first: 37, other: 52 },          // the official sheet's numbers (example values)
  ability: {
    resolve(ctx) {
      const evil = ctx.aliveNeighbours(ctx.holder).filter((p) => ctx.registers(p).alignment === 'evil').length;
      ctx.inform({ truth: [`${evil}`], falseOptions: [0, 1, 2].filter((n) => n !== evil).map(String) });
    },
  },
});
```

`defineRole<State>` is generic over the ability's memory, so `ctx.state` is typed per role and initialised by `initialState`. Night positions are the official sheet's numbers, so a new character slots in between existing ones without renumbering.

### Hooks

| Hook | Runs when | Current roles |
| --- | --- | --- |
| `setup` | the character is assigned or gained | Drunk, Marionette, Lil' Monsta |
| `setupRules` (data) | counts, Demon count, seating and bag rules are computed | Baron, Balloonist, Godfather, Huntsman |
| `modifyEvilInfo` | evil information is assembled | Marionette, Lil' Monsta |
| `wakes` | the wake list is built; default is every night in its slot | Gossip, Godfather, Scarlet Woman, start-info roles |
| `picker` | collecting; returns an `ActionSpec` or none | Poisoner, Fortune Teller, Philosopher |
| `resolve` | the ability's slot in the night order | almost every night role |
| `interceptKill` | a kill attempt passes through the pipeline, by `priority` | Sailor, Innkeeper, Tea Lady, Fool, Mayor |
| `onDeath` | any player dies | Scarlet Woman, Ravenkeeper, Farmer, Grandmother, Moonchild |
| `onDayEvent` | a nomination, vote, execution, exile or recorded statement | Virgin, Cannibal, Golem, Witch, Mezepheles |
| `dayActions` | the day screen is built; each is a spec plus a resolver | Slayer, Gossip, Juggler, Moonchild, Damsel guess, Artist |
| `registersAs` | another ability asks about the holder | Recluse |
| `deriveConditions` | impairment stage 3 | No Dashii, Vigormortis |
| `transformInfo` | every result before the Storyteller sees it | none yet |
| `visibility` | the holder's view is projected | none yet |
| `checkGameEnd` | after deaths, day events and publish | Mayor, Mastermind |
| `onCharacterChange` | the holder's character changes | default replaces character abilities |
| flags (data) | always | `worksWhileDead`, `startInfo`, `oncePerGame`, `reminder` |

A hook receives a context scoped to one ability instance: `ctx.holder`, `ctx.ability`, `ctx.state`, `ctx.impaired`, `ctx.registers`, `ctx.decide`, `ctx.inform`, `ctx.attemptKill`, `ctx.addCondition`, `ctx.ask`, `ctx.notify`, `ctx.grant`, `ctx.move`, `ctx.changeCharacter`, `ctx.changeAlignment`, `ctx.malfunction`, `ctx.suggestGameEnd`. It exposes no raw state mutation. Core commands, not hooks, add and remove Travellers, Fabled and Loric.

### Evil information

Night 0 has a core evil-info step at the official Minion-info and Demon-info positions. Who learns what comes from `settings.evilInfoPolicy`, then each `modifyEvilInfo` hook adjusts it.

- `house` (the default, matching today's app): Minions learn each other's names but not the Demon; the Demon learns its Minions and three bluffs.
- `official`: Minions also learn the Demon; the official player-count threshold applies.

Evil Travellers learn the Demon under either policy.

### Night resolution pipeline

1. **Snapshot.** Clone the world from the phase's start-of-night state. Resolution never mutates the stored game.
2. **Derive.** Staged impairment and the alive set, computed once.
3. **Wake list.** Every ability instance active tonight (players', the Storyteller's and the game's) plus core steps such as evil information, sorted by night position. A granted ability wakes in its own slot, titled by `shownAs`.
4. **Walk.** Call `resolve` with the holder's choice. Impairment is re-derived only after a step that changed conditions, characters or deaths.
5. **Kills.** `ctx.attemptKill` runs interceptors by priority; each may prevent, redirect (re-entering the pipeline) or pass. A death fires `onDeath` for every ability instance.
6. **After the order.** Abilities that act on a death after their slot (Farmer) run here.
7. **Questions.** `ctx.ask` creates a follow-up question. Unanswered questions block publish unless forced.
8. **Transform.** `transformInfo` hooks see every result; the Storyteller sees truth, transformed suggestion and final.
9. **Result.** A `Resolution`: per-player results, decisions (stale ones flagged), questions, notices, deaths, revivals, malfunctions, game-end suggestions, and the world after the night.
10. **Publish.** Commit the world after, deliver messages, refresh public deaths, run `checkGameEnd`.

Resolution re-runs only after commands that can change it (a decision, an override, an answer, a Storyteller edit during review). `accept_all_defaults` records the current defaults once instead of looping.

### Acceptance roles

Philosopher, Cannibal, Lil' Monsta, Al-Hadikhia, Mathematician, Vigormortis, Scarlet Woman and Mayor are written in this stage, on `main`, with full tests. Between them they exercise granting, hiding and moving abilities, questions to other players, the malfunction log, derived conditions, character change on death and kill redirection. If one needs core code that names it, the API changes now.

### Exit gate

- Every row of the Mechanics coverage table has a passing framework test that uses a throwaway test character.
- The eight acceptance roles pass their tests with no role id in core code.
- Changing an earlier decision leaves later recorded decisions attached to the right questions, and stale ones are flagged.
- Staged impairment gives one answer for a mutual dependency, pinned by a test.
- Night resolution is deterministic: same state, seed and decisions give the same resolution.

## Stage 3: All 55 roles

Stage 3 ports the other 47 current roles onto the framework in order of hook complexity, then adds the jinxes, checking everything against the old engine as it goes. The eight acceptance roles are already done in stage 2.

The current app is a custom set of 55 roles, not Trouble Brewing: it lacks 9 of Trouble Brewing's 22. Those 9 are out of scope, and the Mechanics coverage table makes sure they would fit later.

| Order | Roles | Hooks they need |
| --- | --- | --- |
| 3a (13) | Clockmaker, Empath, Fortune Teller, Oracle, Seamstress, Flowergirl, Balloonist, Butler, Poisoner, Gambler, Devil's Advocate, Assassin, Witch | `picker`, `resolve`, conditions, simple kills |
| 3b (10) | Sailor, Innkeeper, Tea Lady, Fool, Slayer, Virgin, Artist, Fisherman, Golem, Psychopath | `interceptKill`, `dayActions`, `onDayEvent` |
| 3c (19) | Ravenkeeper, Farmer, Grandmother, Moonchild, Huntsman, Damsel, Professor, Goon, Zealot, Juggler, Gossip, Drunk, Recluse, Baron, Godfather, Marionette, Mezepheles, Organ Grinder, Mastermind | death triggers, character and alignment change, setup rules, evil info, registration, game end |
| 3d (5) | Imp, Pukka, Shabaloth, Po, No Dashii | Demon kills, starpass, derived conditions |
| 3e | the 15 jinxes | `defineJinx`, once both roles of each pair exist |

### Work, per role

1. Write the role file from the current behaviour and the official almanac text. Where they differ, record a ruling in `docs/rulings.md` and decide.
2. Write scenario tests for the role's rules and rulings. Old tests are hand-ported only where they pin a specific ruling; general behaviour is covered by the parity harness.
3. Add the role's reminder text and icon.

### Differential parity harness

The old engine is a pure reducer in the same repo, so both engines can run the same games side by side:

- An adapter translates the new commands the fuzzer and scenarios use (join, seat, assign, submit, decide, execute, publish) into old intents.
- After each night and day, compare per player: true result lines, impairment, deaths, revivals and character changes. Suggested false information is not compared, since both engines pick it at random.
- Storyteller defaults that come from a coin flip (Mayor, Sailor, Innkeeper) are pinned: the fuzzer always records an explicit decision and maps it to both engines.
- Every difference needs a ruling and a scenario test before it is accepted. Known bugs, such as the Vigormortis and Scarlet Woman combination, become fixed rulings rather than warnings.
- The harness and the old-engine import are deleted at cutover.

### Exit gate

- All 55 roles and 15 jinxes merged, each role with its own test file, no role id in core code.
- The parity harness runs 10,000 fuzzed games with no unexplained difference.
- The Vigormortis and Scarlet Woman combination has a passing scenario test.

## Stage 4: Server

Stage 4 puts the engine on the network with the outside-attacker defences built in: session hygiene, hard resource limits, hardened sockets, and a load test to prove a flood cannot stall a running game. The server holds no rules logic.

### Socket messages

`protocol/socket.ts` adds the messages, each carrying a protocol version so a stale phone is told to reload. Client sends `hello`, `command { requestId, command }`, `ping`. Server sends `welcome { buildId, catalog }`, `view`, `ack { requestId, ok, error?, data? }`, `removed`, `reload`.

### Server modules

| Module | Responsibility |
| --- | --- |
| `http/` | `GET /healthz`, `GET /api/config`, `GET /api/g/:code/names`, `POST /api/g/:code/join`, `POST /api/g/:code/rejoin`, `GET /api/g/:code/export` (Storyteller), `GET /api/status` for `update.sh` |
| `ws/` | upgrade with cookie auth and Origin check, one bounded command queue per game, acks, heartbeat |
| `auth/` | sessions, site password, password-failure backoff |
| `limits/` | client IP resolution, token buckets, connection caps, resource caps |
| `games/` | in-memory games, dispatch, persist, project and broadcast |
| `store/` | SQLite tables `games`, `commands`, `sessions`, `archive` |

### Sessions and access

- Session tokens: 256-bit random, stored only as SHA-256 hashes, sent as `HttpOnly; Secure; SameSite=Strict` cookies. Never in a URL, a view or a log line.
- Rejoining as any player stays, gated by the site password, because cheating is out of scope. Rejoin issues a new session and never reveals an existing one.
- The server refuses to start when it is exposed without a password: `TRUST_PROXY`, or an `https` `PUBLIC_URL` with no `SITE_PASSWORD`. Without one, a stranger could claim the Storyteller seat and erase the game. LAN mode still runs without a password.
- `@fastify/helmet` with a strict Content Security Policy (`default-src 'self'`, no inline scripts), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`.
- Logs record player id and command type, never tokens, passwords or full payloads.

### Client IP

Caddy stays the only way in, as today. Caddy overwrites `X-Forwarded-For` with the real peer address (`header_up X-Forwarded-For {remote_host}`), and the app trusts that header only when the TCP peer is Caddy's configured address; otherwise it uses the socket address. If this is wrong, limits either hit the whole table or can be dodged, so it has its own tests.

### Abuse and denial-of-service limits

The numbers are starting values in `config.ts`.

- **A valid session bypasses abuse limits.** Players at a venue share one public IP, so per-IP limits apply only to requests without a session.
- **No hard bans.** Wrong passwords back off exponentially per IP (1 s doubling to 5 minutes), so one mistyping player cannot lock out the table and an attacker cannot either.
- **Unauthenticated requests stay cheap.** A request with neither a session nor the right password never touches SQLite and never runs the engine. A global token bucket throttles unauthenticated join, rejoin and names requests.
- **Sockets.** Authenticate from the cookie and check `Origin` at upgrade, before allocating anything. At most 3 sockets per session and 20 per IP. A token bucket per socket (10 messages a second, burst 20). `perMessageDeflate` off, `maxPayload` 16 KB, heartbeat every 20 s, dropped after two misses.
- **Resource caps.** 20 players per game, 4 live games, names up to 24 characters, 20,000 commands per game log, request bodies up to 64 KB, the archive pruned to the newest 20 games so the disk cannot fill.
- **Bounded work.** Each game's command queue holds at most 32 pending commands; beyond that, commands are refused with a retry message. Night re-resolution, the expensive step, only runs for commands that can change it.
- **Caddy.** Serves static assets with long-lived caching, and enforces header and body read timeouts against slowloris.

### Persistence

- After every command: append to `commands` and write the snapshot to `games`, in one transaction.
- At boot, every snapshot is parsed with the zod `GameState` schema. A snapshot whose engine version differs, or that fails to parse, is moved to `archive` and a fresh lobby is created. No migration code exists.
- `EngineVersion` is bumped by hand when the state schema changes. A CI test hashes the `GameState` schema and fails if the hash changes without a bump. Base-image rebuilds and rules-only fixes keep the version, so they don't end games.
- `export` returns the command log plus the engine version, for bug reports.

### Broadcasting

After a command, the server projects a view per connected client and sends it only if its hash changed. Presence is merged into the Storyteller view by the server, not stored in game state.

### Exit gate

- A headless test client plays a full game over real sockets.
- Security tests: no token in any view, export or log; a wrong `Origin` is rejected; a spoofed `X-Forwarded-For` from a peer other than Caddy is ignored; backoff grows and resets; exposed mode without a password refuses to start.
- Load test (k6 or autocannon): flood unauthenticated joins and socket connects from many addresses while a scripted game runs. The game's command round trip stays under 250 ms at the 95th percentile (a starting target).
- A restart restores the game; a version bump or a corrupt snapshot archives it.

## Stage 5: Client foundations and player app

Stage 5 builds the shared client foundations and rebuilds the phone app as a thin renderer of `PlayerView`, including the two idle mini-games. It contains no game rules: every picker, option and message comes from the server.

### Client foundations (shared with stage 6)

- `app/socket.ts`: one connection per tab, reconnect with backoff, request ids and acks, the reload bar when `buildId` or the protocol version changes.
- `app/store.ts`: the latest view in a store read through `useSyncExternalStore` (or Zustand). No module-level session variables, no global toast function.
- `useCommand()`: sends a command, returns pending, success and error state, and shows errors through a toast provider.
- Routing: `/g/:code` for players, `/g/:code/storyteller/*` for the Storyteller console, so tabs are URLs and survive reloads.
- `ui/`: design tokens as CSS variables (light and dark), CSS modules per component, a small component set (button, hold-to-confirm button, card, list, sheet, toast, countdown).
- Role icons served as static assets by role id.

### Screens

| Screen | Shows |
| --- | --- |
| Join | name, role-type preference, password when required, "I'm already in this game" list |
| Lobby | who has joined, waiting for the Storyteller |
| Role | tap-to-reveal role card, the script's roles and night order, seating once published, public Traveller characters |
| Night | the generic picker for each `ActionSpec` (player, role and option fields; distinct and decline rules), submitted state, countdown |
| Question | follow-up questions during review (Ravenkeeper and others) |
| Dawn | this night's private messages, then the full message history |
| Day | seating with public deaths, ghost vote, own role |
| Idle games | Flap and 2048, unlocked after submitting, in a lazily loaded chunk that imports only the theme |
| Ended | result and "waiting for the next game" |

The picker is the one place the client knows about ability input, and it knows only the three field kinds. A new role never changes it.

### Exit gate

- Component tests for the picker cover every field kind, decline and distinct rules.
- Playwright test: five player browser contexts and one scripted Storyteller (via the test client) play a full game to the end.
- Works at 360 px wide, keyboard accessible, readable in both themes; the mini-games load only when opened.

## Stage 6: Storyteller client

Stage 6 rebuilds the Storyteller console on `StorytellerView`, with role-specific screens generated from data the roles declare. Today's hard-coded Cannibal, Moonchild, Juggler and Gossip panels become generic day actions.

### Screens

| Route | Purpose |
| --- | --- |
| `lobby` | players, rename, remove, join QR code |
| `setup` | script picker, Fabled and Loric, seating (drag to reorder), character and alignment assignment, believed characters and bag tokens, type counts and suggestion, bluffs, evil-info policy, the server's setup checklist and warnings |
| `night` | submission board, submit for a player, mark no action, countdown controls |
| `review` | per player: truth, suggested and final result with quick alternatives; open and stale decisions; stale overrides; follow-up questions; malfunctions; publish |
| `day` | day events (nominations, votes, executions, exiles, statements, madness breaks), deaths and revivals, Travellers joining and leaving, day actions, usage tracker, reminders, game-end suggestions, notes |
| `grimoire` | the circle: characters, abilities held (including the Storyteller's), conditions as reminder tokens, impairment, add or remove a condition |
| `story` | per-night and per-day record of who did what and who was told what |
| `log` | the command log, readable, plus export |

### Generic, data-driven panels

- **Day actions and events.** Each role's `dayActions` arrive as specs ("Slayer: choose a player", "Gossip: statement was true / false / none"). Nominations, votes (counts optional), executions, exiles and recorded statements are core day events any role can react to. The day screen renders all of them with the same field kinds as the night picker, plus preview and accept for actions with consequences.
- **Game end.** `checkGameEnd` suggestions appear as a banner with the winner and the reason; the Storyteller confirms or dismisses.
- **Usage tracker.** Built from abilities flagged `oncePerGame`; ticked automatically or by hand as the role declares.
- **Reminders.** Each role's `reminder` text for abilities in play.
- **Decisions.** Rendered from `{ title, description, options, default, chosen, stale }`, whichever role produced them.

### Custom panels

`role-panels/` holds the rare screen a generic spec cannot express, registered by role id. `docs/role-panels.md` lists each one with a line on why. Target: none for the current 55 roles.

### Exit gate

- A full game with any of the 55 roles can be run from the console alone, with no test client.
- Every screen is fed only by `StorytellerView`; the console imports nothing from `rules` (enforced by CI).
- Playwright: the Storyteller flow from lobby to publish of night 2, including a changed decision, a stale override and an execution.

## Stage 7: Deploy files for :next

Stage 7 writes everything needed to run the new app beside the old one on its own hostname, behind the same Caddy, exposed exactly as today. The Claude Code session writes and checks these files; people deploy them.

### Exposure, unchanged

Caddy keeps terminating HTTPS with automatic certificates on forwarded ports 80 and 443, and the site password is required. The new app adds one site block for its own hostname. There is no edge network in front of the home connection, so a large volumetric flood can still saturate the link; the stage 4 limits protect the app, not the line. That trade-off is accepted.

### Work

1. `deploy/Dockerfile`: build and test `packages/`, then a slim runtime with `better-sqlite3` and the bundled server and client. Non-root user, read-only root filesystem, healthcheck.
2. `deploy/docker-compose.yml`: the existing services plus `clocktower-next` on its own volume, with no published port; only Caddy reaches it.
3. `deploy/Caddyfile`: today's site block unchanged, plus one for `{$CLOCKTOWER_NEXT_DOMAIN}` with header and body read timeouts against slowloris, long-lived caching for static assets, and the `X-Forwarded-For` overwrite from stage 4.
4. `.github/workflows/next.yml`: builds and pushes `:next` from `main` once merged. Written in this session, never run by it.
5. A simpler `deploy/update.sh`: pull, then restart unless `/api/status` reports activity in the last 4 hours, or `--force`. No schema checks.
6. A "Report a problem" button for the Storyteller that downloads the export.
7. A `deploy/README.md` with the manual steps: DNS record for the new hostname, copy the files, `docker compose up -d`.

### Exit gate

- `docker build` succeeds locally (or is logged as skipped when Docker is unavailable).
- The compose file and Caddyfile validate (`docker compose config`, `caddy validate` when available).
- The stage 4 load test passes against the built container behind a local Caddy, when Docker is available.

## Stage 8: Playtest and cutover

Stage 8 is done by people after the Claude Code session, and is the only real-game gate: one playtest on `:next`, then the switch. Everything earlier is proven by tests and the parity harness.

### Playtest

- One session, ideally two games with 7 or more players, using as many roles as possible and all eight acceptance roles.
- Every bug found gets an export, becomes a scenario test, and is fixed before cutover. Exports are not kept as fixtures, so a command-schema change never breaks old replays.

### Cutover

1. Point the release workflow at `deploy/Dockerfile`, so `:latest` and version tags build the new app. Tag `v1.0.0`.
2. Delete `shared/`, `server/`, `client/`, the old Dockerfile, the saved-game migrations and their fixtures, and the parity harness.
3. Replace `design.md` with `docs/architecture.md`, `docs/rulings.md`, `docs/mechanics.md` and the role files themselves as the rules reference.
4. Release notes: the update ends any game in progress and starts a fresh lobby. The previous image stays pullable by version tag for rollback.
5. Retire the `next` hostname, or keep it as a staging instance.

### After cutover

- Multi-game: the manager already keys games by code; add a "new room" flow if you want more than one table at once.
- Script import: read the official script tool's JSON format.
- New characters, one file each, as the Mechanics coverage table promises.

### Exit gate

- The playtest's bugs are fixed and each has a scenario test.
- A normal game night on `:latest` with no rollback.
- The old code is gone from `main`.

## Testing strategy

Most confidence comes from framework tests per mechanic, scenario tests per role, the differential parity harness against the old engine, and fuzzed whole games checked against invariants. Browser tests only confirm the wiring.

### Scenario language

```ts
scenario('A poisoned Empath is offered a false number')
  .seat('Ana:empath', 'Ben:poisoner', 'Cy:imp', 'Di:sailor', 'Ed:recluse')
  .night(1, { Ben: ['Ana'], Cy: ['Di'] })
  .expect.result('Ana', (r) => r.impaired && r.suggested !== r.truth)
  .expect.alive('Di')                     // the Sailor can't die
  .decide({ kind: 'registration', subject: 'Ed' }, 'demon')
  .expect.malfunction('Ana', 'poisoned');
```

It drives the real `dispatch`, so every scenario also exercises commands, phases and projections.

### Layers

| Layer | Where | What it proves |
| --- | --- | --- |
| Framework tests | `rules/test/framework/` | every row of the Mechanics coverage table, with throwaway test characters |
| Role scenarios | `rules/test/roles/<role>.test.ts` | each role's rules and rulings, including impaired and jinxed cases |
| Differential parity | `rules/test/parity/` | the rewrite matches the old engine, or a ruling says why not (deleted at cutover) |
| Fuzzed games | `rules/test/invariants/` | random games hold every invariant |
| Server | `server/test/` | sessions, client IP, limits, Origin, persistence, broadcast |
| Load | k6 or autocannon | a flood cannot stall a running game |
| Browser | Playwright | one player journey and one Storyteller journey end to end |

CI runs about 500 fuzzed and 500 parity games per push. A nightly job runs 10,000 of each. Bug reports arrive as exports; each becomes a scenario test once the bug is fixed, so no replay fixtures need upkeep.

### Invariants checked after every fuzzed command

- A player view shows another player's hidden data only through delivered messages, public facts or a visibility grant the viewer's ability holds.
- No view or export contains a session token.
- Every ability instance's holder exists; every condition's source exists or is the Storyteller.
- Dead players act only through abilities that work while dead; departed Travellers never act.
- Replaying the command log reproduces the state.
- Resolution is a pure function: running it twice gives the same result, and recorded decisions stay on their questions.

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| 8 hours is very ambitious for the full framework, 55 roles and two apps | stages left unfinished | strict gates, time budgets, a fixed cut order, `PROGRESS.md` so a second session can resume; the old app keeps running |
| The hook API misses a pattern | core changes after roles are written | design pass, a framework test per mechanic, eight acceptance roles in stage 2 |
| Rules ambiguity | rework of edge cases | follow the old app, one ruling per question in `docs/rulings.md`, each with a test |
| Unattended work goes off course | wasted session time | gates, no fake passes, work on a branch reviewed through a pull request |
| Parity drift | the rewrite quietly plays differently | differential harness on every push, one real playtest |
| Client-IP misconfiguration behind Caddy | limits hit the whole table, or can be dodged | dedicated client-IP tests, load test behind a local Caddy |
| No edge network in front of the home connection | a volumetric flood can saturate the line | accepted; the app's limits keep it responsive to anything that gets through |

## Settled decisions

These were open questions; the session uses these answers and does not ask again.

- Evil information: the house rule (Minions learn each other, not the Demon) is the default; the official rule is a setting.
- Mini-games: ported in stage 5.
- Internet exposure: as today, Caddy with automatic HTTPS; no Cloudflare.
- Circle and Story views: kept in v1.
- Handler drafts: immer.
- Hostname for `:next`: taken from `CLOCKTOWER_NEXT_DOMAIN`; people set it when deploying.
- Trouble Brewing's 9 missing roles: out of scope; the Mechanics coverage table keeps them addable.
