# Blood on the Clocktower Night Assistant: Design Document

Version: 4. Scope: the 55 roles listed in section 14.
Audience: implementers and contributors.

This document describes the app **as built**: the rules it implements, every decision taken where the rules leave a choice to the Storyteller, and the project owner's later changes ("owner decision").

*Unofficial fan project. Blood on the Clocktower, its character names and ability texts belong to The Pandemonium Institute; see NOTICE.md.*

---

## 0. Reading guide

### 0.1 Rules of engagement for the implementer
1. **This document is the only source of truth for game rules.** Do not search the web for rules and do not rely on memory of the game. If you find a genuine gap, do not stop and do not ask: choose the behaviour that leaks the least hidden information, implement it, and record it in section 19 (Decisions log) of this document for the owner to review.
2. Do not add roles that are not listed in section 14.
3. Role rules live in **data and role modules**, never in UI code.
4. Never guess a hidden-information boundary. If unsure whether a player may see something, they may not.
5. Saved games must keep loading across changes (section 5.5, schema versions).

### 0.2 Where things are

| Topic | Section |
|---|---|
| What the game is | 1 |
| Screens and what each person sees | 3, 10, 15 |
| Engine (impairment, registration, kills, revive, night walk) | 5 |
| Setup and Night 0 | 7, 8 |
| Night flow, review, publish | 9 |
| Day panel | 12 |
| Every role | 14 |
| Decisions and owner changes | 17, 19 |
| Tests | 18 |

---

## 1. Primer: what this game is (for an implementer who has never played)

**Blood on the Clocktower** is a social deduction party game played in person with 5 to 15 players. One person, the **Storyteller** (called the **Admin** in this app), runs the game and knows everyone's secret role. Everyone else is a **player** with a secret **character** (also called a **role**).

**Teams.** Each character is on the **good** team or the **evil** team. Good wins if the **Demon** (the main evil character) dies. Evil wins if only 2 players remain alive. (The app does not check win conditions. This is context only.)

**Character types.** Every character has exactly one type:
- **Townsfolk** (good): most characters. Mostly gather information.
- **Outsider** (good): characters with a drawback.
- **Minion** (evil): helpers of the Demon.
- **Demon** (evil): there is exactly one Demon in a normal game. The Demon kills a player each night.

**Alignment** is good or evil. Normally Townsfolk and Outsiders are good, Minions and Demons are evil. Some characters change a player's alignment mid-game, so the app stores **alignment separately from character**.

**Seating.** Players sit in a circle. Many abilities refer to **neighbours**, the players to the left and right. "Alive neighbours" means the nearest alive player in each direction, skipping dead players.

**Nights and days.** The game alternates **Night** and **Day**.
- At **night** players "sleep". The Storyteller privately wakes players whose characters act at night, in a fixed order called the **night order**. Each woken player may choose targets or receive secret information.
- During the **day** everyone talks openly, players may **nominate** others, players **vote**, and the player with the most votes (if enough) is **executed** (dies).
- This app automates the night. The day is played at the table and the Admin records the facts the app needs (section 12).
- Numbering: the first night is **Night 0**. The first day is **Day 1** and follows Night 0. Then Night 1, Day 2, and so on.

**Abilities.** An ability text containing an asterisk (`*`), for example "Each night*", means **"not on the first night"** (Night 0). No asterisk means it also acts on Night 0.

**Drunk and poisoned ("impaired").** A drunk or poisoned player's ability **does not work**. They are **not told**. If the ability would give them information, the Storyteller may give them **false information**. If it would affect others (kill, protect), it silently has no effect. Drunk and poisoned behave identically for game logic.

**Dies / can't die.** "Dies" means the player becomes dead. Dead players stay seated and mostly lose their ability. "Can't die" protections stop a death. Some effects explicitly override protections.

**Resurrection.** A dead player comes back to life with the same role (Professor, Shabaloth). They can act, be nominated and vote again.

**Registration.** Normally a query like "is this player evil?" is answered with the truth. A few characters (the **Recluse**, the Fortune Teller's red herring, the Lil' Monsta token) make a player **register** as something they are not. In the app, a Recluse registration is a flagged **Admin choice** (default: truthful). The app never randomises it silently.

**Storyteller choice.** "The Storyteller decides" means **the engine recommends and the Admin approves or overrides** before anything is sent to players.

**Demon bluffs.** On Night 0 the Demon is shown 3 good characters that are **not in play**, to help them pretend to be good.

**Grimoire.** The Storyteller's full view of the game state. In the app it is the Admin console.

### Glossary

| Term | Meaning |
|---|---|
| Admin / Storyteller | The one person who runs the game. Not a player, has no character, not seated. |
| Player | Anyone with a character. |
| Character / role | The secret identity and ability. The app uses "role". |
| In play | Assigned to a player in this game. |
| Impaired | Drunk or poisoned. |
| Registers as | How a player counts for other players' abilities. |
| Neighbour | Adjacent seat. Alive neighbour skips dead seats. |
| Night order | Fixed sequence in which roles wake. |
| Believed role | The role a player is *told* they have (Drunk, Marionette). |
| Executed | Killed by day vote. |
| Starpass | The Imp kills itself and a Minion becomes the Imp. |
| Grandchild | The good player the Grandmother learns on Night 0. |
| Public statement | The Gossip's day claim. The Admin judges whether it was true. |
| Dawn | The moment the Admin publishes a night and everyone moves to the day. |

---

## 2. Goals and non-goals

### Goals
1. Players use their own phone or laptop browser to join, see the **list of enabled roles**, see the **night order of roles** (not people), and receive private role and night information.
2. One Admin controls the game: configures roles, seats players, assigns roles, runs nights, records day facts, sees everything.
3. The app does the Storyteller's night bookkeeping: collects all choices, works out who is drunk or poisoned, computes true or false information, lets the Admin review, then releases everything at once.
4. Local hosting in one Docker container, one game at a time, structured so more concurrent games can be added later.
5. Players are never removed from a game for closing their phone or losing connection.
6. Players can only take legal actions. No passwords.
7. Keep players' eyes on their screens at night (mini-games), without letting them play before their night action is done.

### Non-goals
- Day automation (nominations, voting, executions, win checks). Room is left for it (section 13).
- Roles other than the 55 in section 14. Roles are data, so more can be added later.
- Authentication, accounts, internet hosting, TLS.
- Using the role-type preference collected at signup for automatic assignment (it is shown to the Admin in Setup only).

---

## 3. Users and interaction

### 3.1 Player (phone or laptop browser)
Mobile-first web app, no install, opened at the host's address (section 16).

Player screens (bottom tab bar: **Night/Day/Game**, **My role**, **Roles**, **Order**, **Seats**):
1. **Join**: name, role-type preference (Townsfolk / Outsider / Minion / Demon / No preference) and, only while nobody is the Storyteller yet, an "I am the admin" checkbox. A second mode, "I'm already in this game", lists names to rebind (section 3.4).
2. **Lobby**: names of joined players and a waiting message. If nobody is the Storyteller yet, a "Become Storyteller" button. Role preferences are **not** shown here.
3. **Roles**: all *enabled* roles grouped by type, alphabetical within each type, each with ability text. Disabled roles are hidden. (The Admin's Reference tab uses the same list.)
4. **Order**: the order in which **roles** wake on Night 0 and on later nights, generated from the order data and filtered to enabled roles. It never shows who holds a role or whether a role is in play.
5. **Seats**: names in seat order, shown after the Admin publishes seating. **Dead players' names are red**, using the dawn snapshot (section 3.5).
6. **My role (private)**: tap-to-reveal card with role, type and ability text, plus permanent starting information (Demon info, fellow Minions, Damsel notice, secret word). A Drunk or Marionette sees their *believed* role, and the word "Drunk" or "Marionette" never appears on their device.
7. **Night screen** (section 10): countdown, "My role" button, the night action area, and the mini-games once the action is done.
8. **Day screen**: dawn banner ("☀ Dawn — Day N"), the player's own information from last night (or "You learned nothing."), and a private "You have died" card if they are dead, with an **I used my vote** button (one-way; shows "You have used your vote." afterwards; only the Storyteller can restore it). There is **no public list of dead players**.
9. **Game over**: shown when the Admin ends the game.

Players never see other players' roles, choices, statuses or results.

### 3.2 Admin (Storyteller)
Same app, Admin console. Before the game starts the tab bar shows **Lobby, Setup, Night, Review, Day, Grimoire, Circle, Reference, Story, Log**. Once Night 0 begins it shows **Night, Review, Day, Grimoire, Circle, Reference**, and **Lobby, Setup, Story, Log** move into a **More ▾** drop-down menu (the button shows the open page's name when one of them is selected). Capabilities:
- Lobby: player list with online dots, rename or remove a player (allowed in Lobby **and Setup**), the join URL and a QR code.
- Setup: role checklist, seating, role assignment, type counts, setup decisions, and the checklist that gates Night 0.
- Night: start collecting, watch submissions, set or extend the countdown, submit on a player's behalf, mark "no action", flip the Godfather trigger, resolve (section 9).
- Review: decisions (review items), every result with true/suggested/final values, the night walk, publish (section 9.3).
- Day: record deaths, execution, day facts, day abilities (Slayer, Witch curse, Damsel guess), the Ability tracker, Scarlet Woman prompts, start the next night (section 12).
- Grimoire: every player's real role, ghost vote (Vote available/used chip on dead players), believed role, alignment (toggle), alive status (dead players' names in red), impairment and its cause, effects (removable), flags, reminders; change role, add poison/drunk, kill/revive; game facts; settings; end game; play again; new game; force phase.
- Circle: the table drawn as a circle (section 13.2).
- Story: per-night record of roles, impairment, targets and information received (section 13.3).
- Log: the event log.
- Reference: enabled role list and night order.
- Override any computed value before it is published, and reassign any role at any time (logged).
- **Dead players' names are red everywhere in the Admin console** (tables, grimoire, dropdown options, circle, story), and the Admin sees deaths immediately.

### 3.2.1 Confirmations and navigation
- There are no confirmation pop-ups (owner decision). Consequential buttons are **3-second timed buttons** instead: the first click arms a countdown (a fill wipes across the button and its text becomes **Cancel**); clicking again cancels; when the fill completes the action runs. Used for: Begin Night 0 (and Force), Start collecting, Start Night, Force resolve, Publish and send to Day, Remove player, Change role (Grimoire), End game, Play again, New game (erase), Force phase. Everything else acts immediately.
- Impairment is shown as one chip per cause (e.g. "Poisoned by the Poisoner", "Drunk by the Sailor", "Drunk/Marionette (own role)") in Review, the Grimoire and the Story.
- The tab for the game's current phase (Lobby, Setup, Night, Review or Day) is highlighted in gold with a pulsing dot whenever the Admin is on a different tab.

### 3.3 Single Admin
- Exactly one Admin per game, fixed for the whole game. There is no Admin transfer.
- The Admin checkbox is shown only while no Admin exists. A late admin request is treated as a normal join, with no notice. While no Admin is set, any player may claim it from the Lobby (this removes their seat and role).
- The Admin is not seated and has no role.

### 3.4 Reconnection (hard requirement)
- On join the server issues a **player token** (random UUID) stored in `localStorage` and in a long-lived HttpOnly cookie.
- A returning token restores the exact current screen with no re-entry. If `localStorage` is lost but the cookie survives, the app silently rebinds.
- If both are lost, the Join screen's "I'm already in this game" lists the names (the Admin labelled "Storyteller"). Picking one rebinds that person to the new device (good-faith trust). Multiple devices per player are allowed.
- The server never removes a player for disconnecting or being idle. Presence is a green or grey dot visible only to the Admin.
- Realtime uses WebSocket with automatic reconnect. On connect the client gets a full state snapshot.
- All state is persisted to disk on every change, so a container restart does not lose the game.
- Removed players and players of an erased game are sent back to the Join screen.

### 3.5 What players learn about deaths
- The Admin sees every death and revive **immediately**.
- Players see who is dead (red names in Seats and in night pickers) from a **snapshot taken at each dawn** (when a night is published). A death the Admin records during the day appears to other players the next morning, together with that night's deaths.
- The dead player is told privately and immediately: a day death sends "You have died" at once; a night death sends it at publish.

---

## 4. Game flow

```
LOBBY -> SETUP -> NIGHT_COLLECTING(0) -> NIGHT_RESOLVING(0) -> DAY(1)
      -> NIGHT_COLLECTING(1) -> NIGHT_RESOLVING(1) -> DAY(2) -> ... -> ENDED
```

| Phase | Who acts | Notes |
|---|---|---|
| LOBBY | Everyone joins | Admin sees list. |
| SETUP | Admin | Role checklist, seating, assignment, setup decisions. |
| NIGHT_COLLECTING | All players submit at once | Night 0 starts with a role-reveal step. Countdown shown. Section 9. |
| NIGHT_RESOLVING | Admin | Engine computes, Admin reviews, publishes. |
| DAY | Admin | Players see dawn info. Admin records day facts. |
| ENDED | Admin | Players see "Game over". |

Phase changes are Admin-only and rejected if preconditions fail. Every phase has a "force" path with a warning (Begin Night 0 force, Force resolve, publish without the Ravenkeeper, Grimoire → Settings → Force phase to Lobby/Setup/Day/Ended) so the game can never get stuck. "New game (erase)" wipes the game and everyone rejoins. "Play again (same players)", available in any phase, starts a new game in Setup that keeps the players, their seats, the enabled roles and the settings; roles, setup choices, deaths, messages, nights, days and the story are cleared (the event log carries on).

---

## 5. Architecture

### 5.1 Stack
- TypeScript end to end, npm workspaces: `shared/` (role data, night orders, types), `server/` (engine, Fastify + `ws`), `client/` (React + Vite, built to static files served by the server).
- Persistence: SQLite via `better-sqlite3`, one file on a Docker volume.
- Tests: Vitest (section 18).

### 5.2 Multi-game readiness
- Every table row has `game_id`. Every route and WebSocket room is namespaced `/g/:gameCode` (`/api/g/:code/...`, `/ws/g/:code`).
- One default game (`gameCode = "default"`) is created at startup; the root URL redirects to it.
- No module-level game state. Game logic is pure: `applyIntent(GameState, actor, Intent, {now, seed}) -> (GameState, events)`. A `GameManager` maps `gameCode -> live game`.

### 5.3 Server is authoritative
Clients send **intents**. The server validates against phase, the player's real role and the legality rules in section 11. Clients never compute outcomes. Each socket receives only its own view: `playerView` (that player's private data only) or `adminView` (full state). Nothing hidden is broadcast for the client to hide.

### 5.4 Event log
Append-only `events` table (game_id, seq, timestamp, actor, type, payload). Every intent is logged with its full payload (the log is Admin-only). Undo/replay is not implemented.

### 5.5 Persistence and schema versions
- Each game is stored as **one JSON document** (`games.state`), rewritten on every change, plus the event log. This keeps "persist every change" atomic and the engine a pure function. The data model below is logical.
- `GameState.schemaVersion` (currently **8**; every public release up to v0.2.2 wrote v4, the oldest this release upgrades, and the withdrawn v0.3.0 wrote v5 with four extra roles: `MIN_SUPPORTED_SCHEMA` in `server/src/engine/migrations/`). Saved games are upgraded once, at startup, before any game loads (`server/src/upgrade.ts`):
  1. Versions are checked first, changing nothing. A game newer than this release, or older than `MIN_SUPPORTED_SCHEMA` (missing = v1: "Run v0.2.2 once to bring them to v4, then upgrade"), stops startup.
  2. If any game is older than `SCHEMA_VERSION`, the whole database is copied once to `clocktower.db.pre-v<SCHEMA_VERSION>` (a timestamp is appended rather than overwrite an existing copy).
  3. In one transaction, each older game is **ended** if it isn't already (`phase = ENDED`, `night = null`, `nightEndsAt = null`, `endedReason = 'abandoned'` after 4 hours without progress, else `'update'`) — except an empty lobby (`LOBBY`, no players), which is deleted with its events instead (the default game is recreated when games load) — run through the migration steps from its version up, and saved with a `schema_migrated` event `{ from, to, endedReason }`. Any failure rolls everything back and stops startup, naming the game and step.
  When startup stops, the reason is printed as `Not starting: …` (`docker logs clocktower`); with `restart: unless-stopped` Docker keeps retrying, and each attempt refuses again without changing anything.
  4. Games load, and each must be at `SCHEMA_VERSION`.
- **Upgrade log.** Every startup that upgrades anything leaves three records: a row in the `migrations` table (`applied_at`, `app_version` = APP_VERSION and GIT_SHA, `to_schema`, `games_migrated`, `games_ended`, `backup_file`, `details` JSON of code, from-version and `endedReason` per game, plus `deleted: true` for an empty lobby; `games_migrated` leaves those out), written in the same transaction as the games; the `schema_migrated` event in each game (shown on the Storyteller's Log page); and one line in the server output, e.g. `Upgraded 2 games to schema v5 (1 ended: abandoned). Deleted 1 empty lobby. Backup: clocktower.db.pre-v5.` Nothing is printed or written when no game needed upgrading. Deferred updates are logged by `scripts/update.sh` to its own output (`update.log` in the documented cron line).
- Database tables (as opposed to the saved-game JSON) are only ever added, with `CREATE TABLE IF NOT EXISTS`. A release that has to alter an existing table should track that with SQLite's `PRAGMA user_version`, separately from `SCHEMA_VERSION`.
- Steps: v4 → v5 undoes the withdrawn v0.3.0 (schema v5 is taken for good): it removes every stored role id of the Fisherman, Zealot, Organ Grinder and Baron (script entries, held and believed roles, a gained ability, role history, bluffs, the Lil' Monsta Minion role, the Organ Grinder's effects, the story's roles, causes and actions) and drops the ended game's last night; text people were already shown is left as written. It changes nothing else on v4 data, and since a game saved at v5 starts at step 6, step 6 runs it again first. v5 → v6 turns `enabledRoles` (an on/off entry for every known role) into `script`, the list of role ids that were on, and adds `endedReason`. v6 → v7 drops the night (it held the old Ravenkeeper fields) and renames the setting `ravenkeeperExtensionSeconds` to `followUpExtensionSeconds`. v7 → v8 only stamps the version: its additions (`Assignment.eatenAbility`, `roleState.startInfoPending`, the causes `organ_grinder` and `cannibal`, the field kind `option`) are optional or new values, and the `grandmotherInfoPending` it replaces is left as written in ended games, whose role memory is never read again (*Play again* starts a fresh one).
- **The script is a list of role ids** (`script: string[]`). A role added by a later release is absent from every existing game's script, so it is off there without a migration step, while new games start with every role on. It is read only through `onScript` and `enabledRoles` (`server/src/engine/setup.ts`), which ignore ids this release doesn't know (for example after a rollback) and return roles in `ROLES` order. Player views keep the field `enabledRoles: string[]`.
- Because only ended games are migrated, steps never deal with night state. There is one file per step in `server/src/engine/migrations/`; steps read only the saved JSON and never import live code such as `ROLES`.
- Rollback: stop the container, copy `clocktower.db.pre-v<N>` over `clocktower.db`, run the older image.
- **Updates never interrupt a game.** `scripts/update.sh` restarts the app only when every game is `ENDED`, abandoned (not `ENDED`, no progress for 4 hours, `ABANDONED_AFTER_MS` in `server/src/upgrade.ts`) or an empty lobby (`LOBBY` with no players, whatever its age: `isEmptyLobby`); otherwise it prints `Update deferred: game in progress` and the next run tries again. A game's last progress is its latest event other than `rebind` (a reconnect is not progress; a player joining is), else its `createdAt`. The script asks `GET /api/upgrade-status` from inside the container; the endpoint answers only the loopback address (by socket address, never `X-Forwarded-For`), so Caddy can't reach it, and reports only game codes, phases and times. Images carry a `clocktower.schema` label; when it equals the running server's schema the restart goes ahead mid-game, so weekly base-image refreshes never wait. `--force` skips the check. A server too old to have the endpoint makes the script defer unless forced: the first update from v0.2.2 must be run by hand (`--force`) at a time no game is running. Self-hosters get the script's check only by updating their checkout of the repository; the startup upgrade ships in the image.
- **After an update ends a game**, the ended screen (players and Storyteller) shows one line from `ENDED_REASON_TEXT` (`shared/src/state.ts`): `update` "This game was ended by an app update.", `abandoned` "This game was ended for an app update after 4 hours without progress." Players stay in the game, so *Play again* carries everyone into a new Setup.
- **Phones on an old build.** `GET /api/config` includes an opaque `buildId` (a short hash of APP_VERSION, GIT_SHA and BUILD_DATE; the build details themselves stay Storyteller-only). The client remembers the first one it sees and checks it on every reconnect; if it changed, a thin bar above the page says "The app was updated. Tap to reload." It sits in the page flow rather than over it, so the Storyteller's header and tabs stay usable, and × dismisses it. It never reloads by itself, which could lose an unsent night choice.
- **Intent shapes are checked** before the engine sees an intent (`server/src/intent-shape.ts`, one entry per intent type in `shared/src/protocol.ts`): strings are strings, player ids are known players, arrays are arrays. A mismatch gets `Bad request.` with no state change, so a client and server from different builds fail politely.
- **New view fields are optional.** Fields added to `PlayerView` or `AdminView` from schema v5 on are declared with `?`, and the client handles their absence. The same goes for new values inside a view: the player client shows an action field of a kind it doesn't know as a dropdown of its option ids (labels when given), so an `option` field sent to an older phone still works, showing ids such as `live` and `die`.
- **Release notes** mark every release that bumps `SCHEMA_VERSION`: updating to it ends any game in progress. The README's *Updating* section is the user-facing version of this section.

### 5.6 Data model (logical)
- `Game(id, code, phase, endedReason, nightNumber, dayNumber, settings, nightEndsAt, script[], adminId, seatingPublished, publishedSeating[], publicDead[], story[], schemaVersion)`
- `Player(id, name, rolePreference, isAdmin, seat, tokens[], alive, deadAt {phase: night|day, number} | null, deathCause, ghostVoteUsed, hasSeenRole, lastSeenAt)`
- `Assignment(playerId, roleId, believedRoleId, alignment, retainsAbilityWhenDead, grantedAbility {roleId, fromNight} | null, eatenAbility? {roleId | null, fromNight, executeeId, fake} | null, history[])`. `eatenAbility` is the Cannibal's (14.4): absent or null = none; `roleId` null = no ability (an evil executee, or cleared by the Storyteller); `fake` = the executee was evil, so the Cannibal only thinks they have it.
- **Abilities** are derived, never stored: `abilitiesOf(world, playerId, night)` (`shared/src/abilities.ts`, used by server and client) lists each ability as `{roleId, source, real, fromNight}`, with `source` one of `role`, `believed` (Drunk/Marionette: wakes as it, `real: false`), `philosopher` (from `grantedAbility.fromNight`), `cannibal` and `lil_monsta` (the token holder, from night 1). `cannibal` is the eaten ability (`eatenAbility.roleId`, from its `fromNight`), listed when the player has the Cannibal's ability for real (their role, or a Philosopher's gained ability already active) or believes they are the Cannibal (a Drunk or Marionette); `real` is true only for a real Cannibal whose eat was not `fake`, so a believed Cannibal wakes as the eaten role and gets false information through normal impairment. `hidesRole` (same file) is the one place that decides whether a player may know which role an ability is: an eaten ability is hidden unless the Cannibal learns it (`CANNIBAL_LEARNS`: the Butler and Zealot, from their jinxes). A hidden ability goes by "cannibal" in everything sent to the player: `abilityTitle` gives "Cannibal" as its picker and result title, and `abilityKey` gives `cannibal` as its picker's key and role id, its submission key (NightRun reads the submission under `cannibal` back as the eaten role's; a player has at most one eaten ability, and the Cannibal has no picker of its own), and its follow-up questions' key (`cannibal:<playerId>`) and spec. The hiding stops at what the player receives (their view and messages): result rows, follow-up questions' `roleId` and actor rows keep the eaten role, and the Storyteller's Night screen names it with `storytellerLabel`, e.g. "Cannibal (as Fortune Teller)" (the row's `title` is the player's message title). `hasAbility` is the player's actual role (which always counts, including the Drunk's and Marionette's own) or some real entry; `actingRoles` is every entry, in that order. A new source of abilities is added there only.
- `Flags(playerId, key)`: `philosopher_used, seamstress_used, assassin_used, huntsman_used, professor_used, slayer_used, fool_used, virgin_used, golem_used, artist_used, fisherman_used`
- `RoleState(playerId, ...)`: per-role memory such as `lastTarget` (Devil's Advocate), `lastChoiceNone` (Po), `shownTypes` (Balloonist), `grandchildId` (Grandmother), `soberAtDeath` and `moonchildUsed` (Moonchild), `startInfoPending` (role ids of start-information roles gained and not yet told: section 5.7; it replaced the Grandmother-only `grandmotherInfoPending` in v8)
- `Effect(id, type, cause, sourcePlayerId, targetPlayerId, startNight, expiry)`; `type` in `poisoned | drunk | protected | devils_advocate | butler_master | witched`; `expiry` in `until_dusk | until_source_acts_again | while_source_alive_and_sober | until_removed`; `cause` in `poisoner | sailor | innkeeper | goon | philosopher | pukka | no_dashii | vigormortis | witch | organ_grinder | cannibal | own_character | admin` (used by the Mathematician; `organ_grinder` and `cannibal` are reserved for those roles).
- `Setup(demonBluffs[3], redHerringId, lilMonstaMinionRole, lilMonstaTokenHolderId, mezephelesWord, mezephelesSpent, typeCountsOverride?, shabalothKills[], godfatherOutsiders (1 | -1 | null), damselGuessUsed, damselGuessResult)`
- `DayRecord(dayNumber, executedPlayerId, demonVoted, jugglerCorrect, moonchildTargetId, mezephelesSayer, gossipStatement (none|true|false), notes, abnormal?)`; `abnormal` holds the day's abnormal abilities (day kills, 5.12) for that night's Mathematician.
- `NightState(number, collectingOpen, submissions{}, followUpAnswers{key: {choice, byAdmin, at}}, seed, reviewChoices{}, overrides{}, mathAdjust, resolution)`
- `Resolution(actors[], results[], reviewItems[], log[], deaths[], revived[], abnormal[], followUps[{key, playerId, roleId, spec, answered}], notices[], after: World)`
- `Messages(playerId -> [{title, lines, night, kind: result|notice|starting}])`, `PendingNotices` (delivered when the next night starts), `DayPrompts` (Scarlet Woman day prompt)
- `Story`: see section 13.3.

### 5.7 Role definitions
Static data in `shared/src/roles.ts` (`id, name, type, alignment, abilityText, setupModifier?, reminder?, usedFlag?, dayReminder?, startInfo?`) and both night orders as editable tables. `usedFlag: {key, auto}` puts a once-per-game ability in the Day panel's Ability tracker (`auto`: the engine sets it); `dayReminder` shows the role's `reminder` in the Day panel's reminders. `startInfo` marks a role whose information comes only on night 0 (the Clockmaker, the Grandmother); see *Start information* below. Behaviour in `server/src/engine/roles/index.ts`, one module per role:

```ts
interface RoleBehaviour {
  wakes?(ctx): boolean;            // extra condition for waking tonight
  spec?(ctx): ActionSpec | null;   // the player's input tonight (null = wakes without input)
  resolve?(run, actor): void;      // effects, kills, results, review items
  actsWhileDead?: boolean;         // Ravenkeeper, Moonchild, Farmer
  wakesOnNightDeath?: true;        // only on a night they die (Ravenkeeper, Farmer): impairment as of the death, no picker
  onExecution?(ctx: { s, executeeId, holderId, now, real }): void;
                                   // after an execution kills, once per seated player with a real ability of this role
  onExecutionBelieved?: true;      // also call onExecution, with real: false, for players who only believe they have it
}
```

`onExecution` runs for real abilities only (`real: true`), so a Drunk who believes they are the role is skipped, unless the role opts in with `onExecutionBelieved`: then believed entries (a Drunk or Marionette's believed role, an ability eaten from an evil executee) get the call too, with `real: false`, for a role that must seem to work (the believed Cannibal eating). Abilities are counted as they work today (`abilityNightToday`), so a Philosopher who chose the Cannibal last night eats today.

Action fields (`ActionField.kind`) are `player`, `role` or `option`: a fixed set of answers (e.g. Live / Die for a follow-up question) with optional `labels` (`{ id: text }`), shown on the phone as a row of buttons. The answer is the option id, a string, like every field (`server/src/intent-shape.ts`, then `validateChoice`).

**Start information.** A player who gains a start-information role's ability other than at setup (the Philosopher's choice, the Huntsman's Damsel, the Cannibal's eat or the Storyteller's choice for it) is marked by `markStartInfo` (`server/src/engine/world.ts`) in `roleState.startInfoPending`. They get the information **the night the ability is gained**, in the role's slot: a Philosopher's choosing night (both slots come after the Philosopher's), the Damsel's night, even though a player given a role tonight otherwise acts from the next night (the exception is for start-information roles only). The Cannibal's case is the night after the execution, the first night the eat is active. The information is a normal result (false if impaired), and the mark clears, so it comes once. The Grandmother's link starts the night after she gets the information. The Clockmaker has an other-night slot for this alone ("Only if the ability was just gained"), beside the Grandmother's.

Every role change goes through `changeRole(w, pid, roleId, reason, now, opts)` in `server/src/engine/world.ts`: new role, its alignment, no believed role, one history entry. By default it also clears the player's gained and eaten abilities, dead-ability flag, role memory and the effects they caused; `keepAbilities` keeps the first three (a Demon change, the Huntsman's Damsel), `keepTies` keeps the last two (setup, a new Demon, the Huntsman's Damsel), `keepAlignment` keeps the player's current alignment instead of the new role's, and `clearFlags` also clears their used flags (a live reassignment). A cleared eaten ability is left absent rather than null.

The night-order reference shown to players is generated from the order tables, never hand-written separately.

### 5.8 Impairment
`computeImpairment(world, night)` returns, per player, `{ impaired, causes[] }`. Roles read impairment only from this function.
- A player is impaired if any active `poisoned` or `drunk` effect applies, or their actual role is Drunk or Marionette (cause `own_character`).
- Two passes: first the unconditional effects; then effects that depend on their source being alive and sober (`while_source_alive_and_sober`, e.g. Vigormortis poison) and the derived No Dashii poison (the closest Townsfolk on each side of a sober, alive No Dashii, alive or dead, going past Outsiders, Minions and Travellers).
- A Philosopher's drunk effect (cause `philosopher`, stored as `until_removed`) depends on its source the same way, keyed on the cause: it applies only while the Philosopher is alive and not impaired in the first pass.
- Effects are applied as the night order is walked, so a role that wakes later sees effects created earlier tonight.
- `until_dusk` effects are cleared when the next night starts. Poison "tonight and tomorrow day" is `until_dusk`.

### 5.9 Registration
Only a **sober Recluse** (alive or dead) is a registration source with an Admin choice. When an ability asks about a Recluse, the engine creates a review item for that asker and that Recluse: "Truthfully (good Outsider)", "As an evil Minion" or "As an evil Demon" (default truthful); for "which character?" (Ravenkeeper) the options are truthful or any enabled Minion/Demon. The choice applies to that query only. A non-truthful choice logs an abnormal event for the Mathematician against the **asker**, whose ability got wrong information, never the Recluse, whose ability worked normally. Two players misled by the same Recluse in one night count as 2.
Fixed registrations (no choice): the red herring is a Demon to the Fortune Teller; the Lil' Monsta token holder is the Demon for every ability; the Goon is its current alignment.

### 5.10 Kill pipeline (night)
All night deaths go through `attemptKill(target, cause, attacker, options)`. Causes: `demon_attack`, `assassin`, `ability_kill` (Moonchild, Gossip, Godfather), `self_gamble`, `grandchild_link`.
1. Target already dead: nothing ("already dead").
2. Unless the cause is `assassin`, protections (any one prevents the death):
   - a sober Sailor;
   - an active Innkeeper `protected` effect;
   - Tea Lady: target is one of the two different alive neighbours of a sober Tea Lady and both register good;
   - Fool: a sober, unused Fool (prevents the death and sets the used flag; checked last).
   When a protection would have applied but its owner is impaired by another character, an abnormal event is logged.
3. Mayor: if the target is a sober Mayor and the attacker is another player (any cause except `self_gamble` and `grandchild_link`), create the Mayor review item (section 14, Mayor).
4. Otherwise the target dies: `deadAt = {night, n}`, `deathCause`, triggers: Ravenkeeper second round, Moonchild sobriety recorded, Scarlet Woman check (if the dead player is the Demon), Grandmother link (if the cause is `demon_attack`), Vigormortis and Shabaloth bookkeeping in their own modules.

### 5.11 Revive
`revivePlayer(playerId)` is the only way a player comes back (Professor, Shabaloth, Admin "Mark alive"): alive again, `deadAt` and `deathCause` cleared, ghost vote restored, removed from `shabalothKills`, `retainsAbilityWhenDead` cleared, pending Moonchild data cleared. It fires no death trigger. The player is told "You are alive again" (at publish for a night revive, immediately for a day revive). A player revived at night (`NightRun.revive`: the Professor, the Shabaloth, the Al-Hadikhia's "live") **acts in every slot of theirs that comes after the revival**, with slot conditions and once-per-game flags as normal: a role with no input resolves as usual, and a role with input is asked as a follow-up question (key `late:<playerId>:<roleId>`, section 9.4) starting "You have been brought back to life." A player given a new role during a night (the Huntsman's Damsel, the Farmer's new Farmer, a Scarlet Woman changed back by the Al-Hadikhia jinx) waits until the next night (exception: start information, section 5.7).

### 5.12 Day kills
`previewDayKill(target)` for the Slayer shot and the Witch's curse runs the normal protections except the Mayor bounce and the Innkeeper (both night only): sober Sailor, Tea Lady (true alignments, no Recluse prompt), unused sober Fool. The Admin sees the outcome in a dialog ("X would die", "X cannot die because …") with **Accept, Cancel, Force death, Force survive**. On confirm the death is recorded with `deadAt = {day, n}` and the normal triggers fire (Scarlet Woman prompt, Moonchild sobriety, Fool used flag, immediate "You have died" notice). When the shot or curse is applied (not on preview or Cancel), the day's `abnormal` list records the Slayer if impaired by another character, the Slayer if a sober Recluse registers as the Demon, and any protector whose protection would have saved the target but failed because another character impaired them.

### 5.13 Resolution algorithm

```
resolveNight(state):                      // pure; clones the world
  if a Godfather can act on Night 1+: review item "godfather_trigger"
  for slot in nightOrder(night):          // 14.1
    for actor in actors(slot):            // acting role = believed role (Drunk/Marionette),
                                          // actual role, Philosopher-gained role (from the night
                                          // it is chosen), Lil' Monsta token; dead actors only if they
                                          // keep an ability, or Ravenkeeper/Moonchild rules;
                                          // skips players given a new role earlier tonight
      ask late input if the ability became active after collecting closed (revived, or a
                                          // Philosopher's choice tonight): a follow-up question
      goonCheck(actor)                    // first chooser of a sober Goon becomes drunk
      log abnormal event if impaired by another character
      role.resolve(run, actor)            // effects, attemptKill, results, review items
  return { results, reviewItems, actors, deaths, revived, notices, after-world }
```

- **Review choices are inputs.** Resolution re-runs from the start of the night whenever the Admin changes a decision or edits state, so an early choice (e.g. who the Sailor makes drunk) changes everything after it.
- Random recommendations use the night's seed and a separate stream per decision key, so changing one item never re-rolls the others.
- Ordering: modifiers (Philosopher, Sailor, Poisoner, Innkeeper) first, then the Witch and kills, then revive/convert (Professor, Huntsman), then death-triggered roles (Moonchild, Grandmother, Ravenkeeper), then information roles, Mathematician last.

---

## 7. Setup phase

### 7.1 Role checklist
- All 55 roles grouped by type with a checkbox each (default all enabled), plus All/None.
- Unchecking a role removes it from the assignment dropdown, bluff candidates, the random suggestion and **the lists shown to players**.
- Warnings (non-blocking): too few enabled roles of a type for the player count. No Demon enabled blocks Night 0 (unless forced).
- After Night 0 the checklist can still be changed with a confirmation; player lists update live.

### 7.2 Seating
- Drag-to-reorder (mouse) plus ↑/↓ buttons (touch), Unseat, add unseated players, Randomise.
- "Publish seating" shows players the names in order with a note that the last sits next to the first. It is a snapshot; republish after edits. Beginning Night 0 publishes it automatically if it never was.

### 7.3 Role assignment
- Per player: dropdown of enabled roles, duplicates blocked. When a player has no role yet, the empty option shows their stated preference ("— wants Minion —"), or "— none —" if they gave none.
- "Suggest distribution": uses the Admin's type counts if set (7.4), otherwise the default chart and modifiers, and proposes a random fill shown as a list with Apply / Reroll / Discard. It never puts the Vigormortis and the Scarlet Woman together, and when it picks the Huntsman it also includes the Damsel (or swaps the Huntsman out if there is no Outsider slot).
- **Vigormortis and Scarlet Woman:** these two must not be in the same game. Assigning them together by hand is allowed; while both are in play a standing warning box ("Vigormortis and Scarlet Woman are both in play … known bugs") shows at the top of the Roles card in Setup and of the Grimoire, and a line stays in the setup checklist warnings.
- **Change anytime:** the Admin may reassign any role at any phase. A confirmation summary lists what is cleared (effects the player created, flags, role memory, gained ability, alignment reset to the new role's natural one). The change is logged and the player gets "Your role has changed" (setting `notifyOnRoleChange`, default on).
- The Admin can flip a player's alignment at any time.

### 7.4 Type counts (5 to 15 players)

| Players | Townsfolk | Outsiders | Minions | Demon |
|---|---|---|---|---|
| 5 | 3 | 0 | 1 | 1 |
| 6 | 3 | 1 | 1 | 1 |
| 7 | 5 | 0 | 1 | 1 |
| 8 | 5 | 1 | 1 | 1 |
| 9 | 5 | 2 | 1 | 1 |
| 10 | 7 | 0 | 2 | 1 |
| 11 | 7 | 1 | 2 | 1 |
| 12 | 7 | 2 | 2 | 1 |
| 13 | 9 | 0 | 3 | 1 |
| 14 | 9 | 1 | 3 | 1 |
| 15 | 9 | 2 | 3 | 1 |

Outside 5–15 the nearest row is used and Townsfolk absorb the difference.

Modifiers (each applied when that role is assigned; Townsfolk absorb the difference):
- **Balloonist**: +1 Outsider.
- **Vigormortis**: −1 Outsider.
- **Lil' Monsta**: none. The chart is used unchanged, because the Lil' Monsta player takes the Demon slot and becomes the extra Minion at publish.
- **Godfather**: −1 or +1 Outsider, chosen by the Admin (default +1), applied after every other modifier (Baron, Vigormortis, Balloonist). Only +1 is allowed when no Outsider is left to remove after those (`outsidersBeforeGodfather`): 7 players, no Outsiders; 7 players with the Baron, 1 or 3.

**Admin override:** four number inputs that must add up to the player count, with "Reset to default chart". Modifiers apply only to the default chart. The Drunk counts as an Outsider, the Marionette as a Minion, the Damsel takes an Outsider slot. Counts are advisory: mismatches only warn.

### 7.5 Setup checklist (gates Night 0) and Storyteller briefing
Required items appear as roles are assigned; **Begin Night 0** is enabled when all are done (or forced with a warning):
1. Everyone seated; every seated player has a role (exactly one Demon is a non-blocking check).
2. **Drunk:** choose the believed role (an enabled Townsfolk not in play and not another player's believed role).
3. **Marionette:** choose the believed role (an enabled good role not in play). The app warns if the Marionette does not sit next to the Demon. Jinxes (14.8): believing the Huntsman adds a required "Jinx (Marionette & Huntsman)" item, done once the Damsel is in play; believing the Balloonist adds a "Jinx (Marionette & Balloonist)" warning that an Outsider may be added.
4. **Fortune Teller:** the red herring. "Recommend" picks a random good player who is not the Fortune Teller, Recluse or Drunk; the Admin may choose any good player.
5. **Demon bluffs:** exactly 3 good roles not in play and not anyone's believed role ("Suggest random" prefers Townsfolk).
6. **Mezepheles:** the secret word (random from a built-in list of over 250 simple nouns, or typed).
7. **Lil' Monsta:** the Minion role the Lil' Monsta player becomes (enabled, not in play).
8. **Godfather:** Outsiders −1 or +1 (must be pressed once).
9. **Huntsman:** needs the Damsel in play.

The **Storyteller briefing** (Grimoire) lists: the Drunk and Marionette with believed roles, Lil' Monsta details, the red herring, bluffs, the Mezepheles word, the Damsel (and any Huntsman conversion), the Outsiders the Godfather will learn, the evil team, and the reminder that Minions learn each other but not the Demon.

---

## 8. Night 0

1. Admin presses **Begin Night 0**. Each phone shows **My role** (tap to reveal) and the starting information below, with an "I have seen my role" button. The Admin's Night board shows who has seen their role.
2. Starting information (kept under *My role* for the whole game):
   - **The Demon** learns the Minions' names (not characters), which player is the Marionette if any, and the 3 bluffs, plus "Tell your Minions who you are in person."
   - **Lil' Monsta player:** receives exactly the Demon's information (they are the Demon until publish).
   - **Minions learn each other:** every Minion except the Marionette gets "Your fellow Minions": "The other Minions are: A, B." or "You are the only Minion.", plus "The Demon will reveal themselves to you at the table." Names only. They are **not** told who the Demon is. The Marionette gets nothing and is not listed (they believe they are good).
   - **Damsel:** if a Damsel is in play, every Minion except the Marionette gets "A Damsel is in play." (not who). Lil' Monsta's player gets it after becoming a Minion at publish. A Minion created later does not get it automatically.
   - **Mezepheles** learns the secret word.
   - A **Drunk** or **Marionette** sees only their believed role.
3. Admin presses **Start collecting**; the night screen (section 10) appears for everyone.
4. Players submit as in section 9. No one dies on Night 0 (every kill role acts only from Night 1; the Pukka only poisons).
5. Resolve, review, publish. At publish on Night 0 the Lil' Monsta player becomes the chosen Minion ("Your role is now X") and holds the token.

---

## 9. Night N flow and countdown

### 9.1 Start
Admin presses **Start Night N** (from the day). The server records the day in the story (13.3), clears `until_dusk` effects, clears last night's results and notices (starting information stays), delivers pending notices (e.g. a Scarlet Woman who became the Demon by day), opens collecting and sets `nightEndsAt = now + countdownSeconds` (default 300).

### 9.2 Collecting
- Expected players: every alive player plus every dead player who keeps an ability. Each presses **Submit** (real choice) or **Continue** (no action). Others may still press Continue; it is recorded as an acknowledgement.
- Players may change a submission until collecting closes.
- The Admin board shows each player's role (and believed role), what they wake as, status (seen role / submitted / pending / not required) and their choice. The Admin can **Act** for a player (enter their choice for them) or **Clear** their submission.
- **Godfather trigger** control (when a Godfather can act): shows whether the Godfather may kill tonight, with **Flip** and **Use rule**. The Godfather's picker updates live.
- The countdown is a suggestion: at zero the Admin sees "Time is up" and nothing happens automatically. Buttons +1 min, +3 min and Set (also changes the default for later nights).
- **Resolve night** is enabled when everyone expected has submitted or the countdown has ended; **Force resolve** is always available with a warning.
- Nobody receives information until the Admin publishes.

### 9.3 Resolve and review
The Review tab shows:
- **Decisions** (review items) with the recommendation marked; "Accept all defaults". Kinds: registration (Recluse), Sailor and Innkeeper "who is drunk", Mayor attack, starpass, Scarlet Woman, Shabaloth regurgitation, Vigormortis poison side, Balloonist player, Mezepheles conversion, Godfather trigger, Godfather Recluse list/hide, Gossip victim, Huntsman new role, Grandmother grandchild, Grandmother link.
- **Information to send**: per result, the true value, the suggested value when impaired (with causes), what will be sent, quick-pick alternatives, free-text edit and reset. Everyone without a result gets "You learned nothing." The notices that will be sent are listed.
- **Mathematician panel** (if one acted): the day's and the night's detected abnormal players, with reasons and checkboxes, and players to add. Day abilities the app doesn't run (Virgin, Golem, Artist and the like) are added here by hand.
- **Night walk**: every actor in order with input, impairment and outcome. Deaths and revivals.
- **Reopen collecting** and **Publish and send to Day**.

### 9.4 Follow-up questions (the Ravenkeeper's second round)
A role can ask a player a question while the night is reviewed: its behaviour calls `NightRun.askFollowUp({ key, playerId, roleId, spec })`, which returns the answer if there is one, else null, and records the question in `resolution.followUps`. The player's phone shows each unanswered question (`PlayerView.me.followUps`) with the usual picker; the Storyteller sees one card per unanswered question with a picker to answer for them (`answer_follow_up` / `answer_follow_up_for`, both checked against the question's spec). Built-in rules: publishing is refused while a question is unanswered, unless forced (the player then gets no information); the countdown is extended by `followUpExtensionSeconds` (default 120) when questions appear on resolving; "Accept all defaults" never answers a question; re-opening collecting clears all answers.

Late input uses it: an ability that became active after collecting closed (a Philosopher's choice, a revived player) asks for its input when the walk reaches its slot, with key `late:<playerId>:<roleId>` and the role's normal spec built against the night's world. A submission for that ability, if there is one, is used instead. Until it is answered the actor row says it is waiting and the ability does nothing.

The Ravenkeeper uses it: if a Ravenkeeper (or a Drunk/Marionette who believes they are one) dies tonight, they are asked (key `ravenkeeper:<playerId>`) to choose a player. Their result uses their impairment at the moment of death. The Ravenkeeper and the Farmer share this "wakes only on a night they die" rule (`wakesOnNightDeath`).

### 9.5 Publish and send to Day
One atomic step: the night's world is committed, the story is recorded, every result and notice is delivered, dead players get "You have died", revived players get "You are alive again", Lil' Monsta's Night 0 role change happens, the **dawn snapshot of deaths** (`publicDead`) is taken, and all phones switch to the Day screen.

---

## 10. Night experience

**Layout (every player):** header with "Night N", the countdown and a "My role" button; the main area; a bottom bar.

**Night action:**
- A player whose role acts tonight with a choice gets a **real picker** (dropdowns; legal options only, section 11) behind a **Night action** button, and **Submit**.
- A player with no choice tonight (including roles that wake only to receive information, e.g. Empath, Clockmaker) sees "**No night action tonight.**" and a **Continue** button. There are no decoy pickers. (Owner decision: this does reveal who has a choice; the goal is eyes on screens.)
- After submitting: "Submitted. Waiting for everyone." with a **Change** button (real actors only) while collecting is open.

**Mini-games:** locked until the player has submitted (or the night has closed). Before that the main area shows a moon and "Make your night choice and submit it." / "Press Continue below." with "The games unlock once you're done." Once unlocked, a switch offers two games, remembered per device:
- **Lantern Slice:** swipe to slice glowing shapes launched in arcs; score counter.
- **2048:** swipe (or arrow keys) to slide and merge tiles on a fixed-size 4×4 board; tiles slide, pop when they merge and grow in when new; New game; best score kept on the device.
- **Night Flight** (tap-to-flap, a bat between clock-tower spires) is kept in `client/src/player/FlapGame.tsx` but not offered. Phones that had it selected fall back to Lantern Slice.
Games are canvas/DOM only, with no sound, no network, and nothing sent to the server.

---

## 11. Legal-action enforcement

The server validates every intent; the client pre-filters options but is never trusted. Illegal requests return an error and are logged.

General:
- Only the Admin can change phase, assign roles, edit state, resolve and publish.
- A player may only submit for their own player id and their own acting roles. A Drunk or Marionette submits against the believed role's input rules; the server stores it under their real player.
- Submissions are accepted only while collecting (answers to follow-up questions only while their question is open) and only for roles that act on this night number. A player without a real action can only acknowledge (any content is discarded, with an identical response).
- **Dead players appear in night pickers.** Abilities can be wasted on dead players ("already dead" for kills). Exceptions: the Sailor, the Devil's Advocate and the Huntsman list only living players (their abilities say so; players who died during the day are left out, which leaks nothing because day deaths are public at the table); Lil' Monsta's "pass the token to" lists only living Minions; the Professor lists only players dead at the start of the night. The Admin's own pickers (Moonchild target, Gossip victim, Mayor redirect) list alive players.
- An action with no legal choice (an empty option list, or more distinct players needed than are eligible) becomes declinable ("No legal choice").
- Once-per-game abilities cannot be used when their flag is set.
- Players can never read another player's data; every private read checks the token.
- Names: plain text, escaped, 1 to 24 characters, unique per game (case-insensitive). Rebind-by-name works within the same game only.

Per-role inputs are in section 14.3.

---

## 12. Day panel (Admin)

| Entry | Used by |
|---|---|
| Each player's status, forward only: **Alive → Dead → Vote used** (three columns: the player, red when dead; a status column with day-relevant statuses — drunk/poisoned with cause, Witch's curse, Devil's Advocate protection, Butler's master; and one action slot showing **Dead**, then **Dead vote** (marks the ghost vote used), then a "Dead vote used" tag; restoring a vote happens in the Grimoire; dead players can also mark their own vote used from their phone) | Everything; ghost vote tracking. Revives and undoing a used vote are done in the Grimoire (Revive, vote chip). Player abilities only revive at night (Professor, Shabaloth). |
| Execution (player, and whether they died) | Reminders, Fool, Devil's Advocate |
| Did a Demon vote today? Yes / No | Flowergirl |
| Juggler's number correct (0–5), Day 1 | Juggler |
| Moonchild's chosen player (an alive player) | Moonchild |
| Good player who said Mezepheles' word (first press only for the whole game; can be cleared) | Mezepheles |
| Gossip's statement: None / True / False (per day, frozen when the night starts) | Gossip |
| Slayer shot: pick a target ("registers as" selector for a sober Recluse), Resolve shot → day-kill dialog (5.12) | Slayer |
| Witch's curse: the cursed player, "They nominated, apply curse" → day-kill dialog (uses up the curse) | Witch |
| Cannibal: one row per player with the Cannibal's ability (real or believed) who has eaten: "X ate Y: the Empath ability from night 2", or after an evil executee "evil, poisoned; thinks they have no ability"; a character dropdown (default: the eaten ability, or Nothing) and **Confirm** (`set_cannibal_ability`; only Confirm sends) | Cannibal |
| Record Damsel guess (once per game for the evil team) → banner: win / no effect / wrong, with **Retract guess** (clears the record; nothing is ever sent to players) | Damsel |
| Notes | Story |

- **Scarlet Woman prompt:** when the Demon is marked dead in the day with 5+ alive and a sober Scarlet Woman alive, a prompt asks whether she becomes the Demon. On yes her role changes immediately (grimoire) and she is told when the next night starts.
- **Eyes-closed voting:** a banner "Eyes-closed voting today" while the Organ Grinder's ability works (14.6; `AdminView.eyesClosedVoting`, optional).
- **Ability tracker:** one row per once-per-game ability a player really has (their role, or one gained: a Philosopher who chose the Fisherman gets a Fisherman row), never a believed one; chips "Unused/Used" for Virgin, Golem, Artist, Fool, Slayer and Fisherman (Admin toggles; the engine sets the Fool and Slayer itself), automatic chips for Assassin, Seamstress, Philosopher, Huntsman and Professor, and "Guess unused/used" for the Damsel guess (resettable).
- **Reminders:** Devil's Advocate protection, Butler's master, Witch's curse, the Fool, and day-only role reminders.
- Day-only abilities (Virgin, Golem, Artist, Fisherman, Mastermind, Psychopath, Mayor's 3-player win, Butler vote restriction, Zealot's voting, Organ Grinder's secret tally, Devil's Advocate execution protection, Fool surviving an execution) are **not enforced**; the Admin applies them at the table.

---

## 13. Extensibility and Admin views

### 13.1 Extensibility
- `phase` leaves room for nomination/voting phases; alive/dead, executions, the Demon-voted flag and used flags are first-class data.
- New roles are data plus a behaviour module; the event log supports adding win checks later.

### 13.2 Circle view (Admin only)
Seats around a circle, seat 1 at the top, clockwise. Each seat shows: seat number, name (red with ☠ if dead), role (coloured by type), believed role, a blue (good) or red (evil) border, impairment, effect tags (protected, cursed, DA'd, master), Lil' Monsta token, red herring, online dot. The centre shows the phase, alive count and bluffs.

### 13.3 Story (Admin only)
Recorded automatically, in chronological order (Night 0, Day 1, Night 1, …), every night expanded by default and collapsible; never sent to players.
- **Night entry** (recorded at publish): deaths and revivals, and per player: seat, name (red if dead), role and believed role, alignment, drunk/poisoned status with causes, targets with outcomes (from the night walk), and **information received** (results and notices as sent; when the sent information differed from the truth, the truth is shown underneath in red).
- **Day entry** (recorded when the next night starts): execution, day deaths with cause, notes.

---

## 14. Role reference

Ability texts are verbatim from the owner. `*` means "not on Night 0". Shared conventions:
- "Impaired" means drunk or poisoned (5.8). An impaired role's effect silently does nothing; for information the engine proposes a plausible false value, always different from the truth, which the Admin approves or edits.
- "Alive neighbours" skip dead seats. "Neighbours" count every seat (Clockmaker).
- Night pickers include dead players (section 11) unless stated.
- "Reminder only" roles never wake; the grimoire shows their reminder.
- Players who only confirm a choice ("You chose X.") get the same text whether or not they were impaired.

### 14.1 Night order

Both orders (night 0, and night 1 and later) are the editable `FIRST_NIGHT_ORDER` and `OTHER_NIGHT_ORDER` in `shared/src/roles.ts`; only enabled, in-play roles wake. A slot's `note` says when it is skipped (the Witch while fewer than 4 are alive, the Ravenkeeper unless killed tonight, the Juggler after night 1, and so on). Demon Info, the Mezepheles word and the Damsel notice are delivered up front; the Godfather's Outsiders and the Grandmother's grandchild at publish.

Constraints that must hold, checked by `server/test/night-order.test.ts` (its role groups are written out, so a new role is placed on purpose):
- The Philosopher, Sailor, Poisoner and Innkeeper come first, in that order.
- Every kill comes before the Ravenkeeper and the information roles.
- Every kill comes before the Professor, except the Moonchild's. This is harmless: the Professor can choose only players dead at the start of the night, so a kill's place relative to the Professor only decides whether a Professor it kills has already acted.
- The Professor comes before the Empath and Oracle.
- The Grandmother comes after every Demon.
- The Al-Hadikhia: other nights only, right after the Vigormortis and right before Lil' Monsta.
- The Farmer, per the official night sheet: other nights only, right after the Huntsman and right before the Moonchild (so before the Grandmother), after every Demon.
- The Organ Grinder, per the official night sheet: first night right after the Godfather, other nights right after the Gambler, before the Devil's Advocate both times.
- A start-information role has a slot in both orders. The Clockmaker's other-night slot exists only for an ability just gained, so a first-night-only ability gained later is used that night (the documented exception in the test): beside the Grandmother's, just before the Ravenkeeper's, after every kill.
- The Mathematician is last.
- Every role that resolves at night has a slot, and every slot names a real role.

### 14.3 Input summary

| Role | Input | Legal choices |
|---|---|---|
| Philosopher | 1 role, or "Not tonight" | Enabled good roles except the Philosopher, once per game |
| Sailor | 1 player | Any alive player, self allowed |
| Poisoner | 1 player | Any player, self allowed |
| Innkeeper | 2 players | Two different players, self allowed, Night 1+ |
| Gambler | 1 player and 1 role | Any player (self allowed) and any enabled role, Night 1+ |
| Organ Grinder | Drunk until dusk / Stay sober (buttons) | Either; no decline, and no submission counts as sober. Every night including Night 0 |
| Devil's Advocate | 1 player | Any living player except last night's choice |
| Witch | 1 player | Any player, self allowed; only while 4+ players are alive at the start of the night |
| Imp, Pukka, No Dashii, Vigormortis | 1 player | Any player, self allowed |
| Shabaloth | 2 players | Two different players |
| Po | 0 or 1 player; 3 after choosing no one | See card |
| Al-Hadikhia | 3 different players, or "No one" | Any player, dead and self allowed. After the Mastermind jinx (14.8): 3 good players, dead allowed, no "No one" |
| Lil' Monsta (token holder) | 1 living Minion and 1 player | Pass-to: a living Minion (self = keep). Victim: any player. Night 1+ |
| Assassin | 1 player, or "Not tonight" | Any player, once per game, Night 1+ |
| Godfather | 1 player | Any player, self allowed; only on Night 1+ when triggered |
| Professor | 1 player, or "Not tonight" | Players dead at the start of the night, once per game, Night 1+ |
| Huntsman | 1 player, or "Not tonight" | Any living player, once per game, any night |
| Ravenkeeper | 1 player | Any player, second round only |
| Farmer | none (a review item for the Storyteller) | Any alive good player, or Nobody |
| Fortune Teller | 2 players | Two different players, self allowed |
| Seamstress | 2 players, or "Not tonight" | Two different players, not the Seamstress, once per game |
| Butler | 1 player | Any player but self |
| All others | none | They see "No night action tonight" |

### 14.4 Townsfolk (27)

#### Clockmaker
- Ability: "You start knowing how many steps from the Demon to its nearest Minion."
- Night 0 only, no input (or the night a player gains the ability: section 5.7). Result: the smallest number of seats (shorter way around, all seats counted, adjacent = 1) between whoever registers as the Demon and whoever registers as a Minion. A Recluse is a registration source.
- Impaired: a whole number from 1 to half the player count, different from the truth.

#### Sailor
- Ability: "Each night, choose an alive player: either you or they are drunk until dusk. You can't die."
- Every night, 1 alive player (self allowed). If sober: a `drunk` effect (cause `sailor`, `until_dusk`) on the Sailor or the chosen player. A 50/50 coin (seeded, logged) recommends which; the Admin accepts or picks the other. Choosing self makes the Sailor drunk.
- Passive: while sober, the Sailor cannot die (night and day kills; not the Assassin).
- Impaired: the choice has no effect.

#### Mathematician
- Ability: "Each night, you learn how many players' abilities worked abnormally (since dawn) due to another character's ability."
- Every night, last, no input. Counts the distinct players with an abnormal event since dawn: the day before (`days[N].abnormal`, 5.12; night 0 has no day) and tonight. An event is an ability used while impaired by **another** character's effect, a protection or passive (Sailor, Tea Lady, Fool, Mayor, Goon, Grandmother link) that failed because of such impairment, an asker misled by a Recluse (5.9; the Recluse's own ability worked normally), including a Slayer shooting a Recluse who registers as the Demon and a Godfather from whom a sober Recluse is hidden on night 0, or a Drunk or Marionette's believed ability (14.8). Not counted: the player's own ability (e.g. a self-drunk Sailor), Storyteller-added poison/drunk, a declined action and a Ravenkeeper's second-round pick. The Admin can add or remove players, on top of everything above, and override the number.
- Impaired: a number different from the truth, from 0 to N, where N is the number of in-play players other than the Mathematician whose role has a night ability or a tracked passive (Sailor, Tea Lady, Fool, Mayor, Goon, Recluse), plus a Drunk or Marionette whose believed role has a night ability. The Slayer and Damsel are not counted.

#### Flowergirl
- Ability: "Each night*, you learn if a Demon voted today."
- Night 1+, no input. Result: the Admin's Yes/No for that day (No if not entered). Impaired: the opposite.

#### Gambler
- Ability: "Each night*, choose a player & guess their character: if you guess wrong, you die."
- Night 1+, a player (self allowed) and a role. Compared to the target's **actual** role (a Drunk is "Drunk"). Wrong and sober: `attemptKill(self, self_gamble)` (protections apply, no Mayor bounce). Told nothing either way.
- Impaired: does not die.

#### Philosopher
- Ability: "Once per game, at night, choose a good character: gain that ability. If this character is in play, they are drunk."
- Any night until used: one enabled good role (not the Philosopher), or "Not tonight". Choosing sets the used flag. Once the Philosopher has gained an ability, the choice never appears again (even if the Ability tracker chip is toggled back). If sober: gains the ability **that same night** (`fromNight` is tonight; the Philosopher's slot is first in both orders, so every gained night ability still has its slot to come, and gained passives work at once), and every player whose actual role is that role gets a `drunk` effect (cause `philosopher`) before their own slot. That effect applies only while the Philosopher is alive and not drunk or poisoned: the holder is sober while the Philosopher is impaired, drunk again once the Philosopher is sober, and sober for good once the Philosopher dies (or the Admin removes it). The player submitted only the Philosopher's choice while collecting, so a gained ability with input is asked as a follow-up question when the walk reaches its slot (key `late:<playerId>:<roleId>`, section 9.4): the role's normal spec against the night's world, and the answer resolves at that slot. Unanswered, the ability does nothing and publishing waits unless forced. A gained ability with no input (the Empath) resolves at its slot as normal. A gained ability also works by **day**: every day-time ability check (`abilityNightToday`: the Slayer shooting and the Recluse being shot, the Sailor, Tea Lady and Fool protections against day kills, the Moonchild's sobriety when they die by day) counts abilities starting the next night. Impairment is still checked as of the last night. So the Slayer's shot is recorded with the Day panel's Slayer button, and a Philosopher-Sailor survives the Witch's curse. Other day abilities (e.g. the Artist's question) are run by the Admin at the table. A start-information role (the Clockmaker, the Grandmother) gives its information that night, once, at that role's slot (false if the Philosopher is impaired there, e.g. poisoned later in the night); the Grandmother's link starts the next night (section 5.7).
- Always told "You chose the X ability."
- Impaired: the use is spent, nothing is gained, nobody is drunk.

#### Juggler
- Ability: "On your 1st day, publicly guess up to 5 players' characters. That night, you learn how many you got correct."
- Night 1 only, no input. Result: the Admin's Day 1 number (0 if not entered). Impaired: a different number from 0 to 5.

#### Fool
- Ability: "The first time you die, you don't."
- Never wakes. If sober and unused, the first night or day kill attempt fails and the used flag is set. The Fool is not told. Executions are applied by the Admin (reminder shown).

#### Empath
- Ability: "Each night, you learn how many of your 2 alive neighbours are evil."
- Every night, no input. Counts the nearest alive player on each side who registers evil (0–2); with only one other player alive, that player counts once. Evaluated after tonight's kills and revivals. Impaired: a different value from 0 to 2.

#### Balloonist
- Ability: "Each night, you learn 1 player of each character type, until there are no more types to learn. [+1 Outsider]"
- Every night, no input. Shows one player (never the Balloonist) whose type has not yet been shown to this Balloonist (types present in the game; whoever is the Demon counts as Demon). The Admin picks the player (default random). After all types: "You learn nothing new." **Only the name is shown, never the type.**
- Impaired: any other player (Admin picks), and no type is marked as shown.

#### Fortune Teller
- Ability: "Each night, choose 2 players: you learn if either is a Demon. There is a good player that registers as a Demon to you."
- Every night, 2 different players. "Yes" if either is the red herring or registers as the Demon (including the Lil' Monsta token holder). Recluse is a registration source. Impaired: the opposite.

#### Innkeeper
- Ability: "Each night*, choose 2 players: they can't die tonight, but 1 is drunk until dusk."
- Night 1+, 2 different players. If sober: `protected` on both for tonight (blocks every night death except the Assassin) and `drunk` (cause `innkeeper`, `until_dusk`) on one (Admin choice, default random). Impaired: nothing.

#### Seamstress
- Ability: "Once per game, at night, choose 2 players (not yourself): you learn if they are the same alignment."
- Any night until used: 2 different players (not self) or "Not tonight". Choosing sets the used flag. Result: same/different alignment by registration (Recluse is a source). Impaired: the opposite (use still spent).

#### Artist
- Ability: "Once per game, during the day, privately ask the Storyteller any yes/no question."
- Reminder only; used flag in the Ability tracker.

#### Ravenkeeper
- Ability: "If you die at night, you are woken to choose a player: you learn their character."
- Wakes only on a night they die (9.4), even if impaired; any player. Result: the target's actual role (Recluse is a source). Impaired at death: a different enabled role.

#### Virgin
- Ability: "The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately."
- Reminder only plus used flag. No effect if impaired when nominated.

#### Mayor
- Ability: "If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead."
- Never wakes; the 3-player win is a reminder only.
- Night attack by another player while sober: a 50/50 coin (seeded, logged) recommends an outcome. Heads: the Mayor dies. Tails: redirect to a random alive player other than the Mayor and the attacker (protected players allowed). The review item offers: Mayor dies, nobody dies, or attack any other alive player. A redirect is a new attempt through the protections with no second Mayor check. Not applied to day kills, `self_gamble` or `grandchild_link`.
- Impaired: no bounce.

#### Tea Lady
- Ability: "If both your alive neighbours are good, they can't die."
- Never wakes. Protects her two different alive neighbours from night and day kills (not the Assassin) while she is alive and sober and both register good (Recluse prompt at night; true alignment by day). Impaired: no protection.

#### Oracle
- Ability: "Each night*, you learn how many dead players are evil."
- Night 1+, no input. Counts players dead at the Oracle's slot (tonight's earlier deaths count, players revived earlier tonight do not) who register evil (current alignment; a dead Recluse is a source). Dead players who keep an ability still count. Impaired: a different number from 0 to D (dead count); 0 if nobody is dead.

#### Gossip
- Ability: "Each day, you may make a public statement. Tonight, if it was true, a player dies."
- No picker. The Admin enters None/True/False for the day. On the following night, if True and the Gossip is alive and sober at their slot, a review item recommends a random alive player other than the Gossip; the Admin approves or picks any alive player; `attemptKill(victim, ability_kill)` (protections and the Mayor bounce apply). The Gossip is told nothing. Impaired: no death.

#### Grandmother
- Ability: "You start knowing a good player & their character. If the Demon kills them, you die too."
- **Night 0:** a review item recommends a random good player other than her (not the Drunk); the Admin may pick any good player. She is told "Your grandchild is X, the Y." (actual character; a Drunk shows as Drunk), and `grandchildId` is recorded.
- Impaired on Night 0: false information (random other player and random enabled role, editable) and **no grandchild** is recorded. A Drunk or Marionette believing they are the Grandmother is always in this case.
- **Link (Night 1+):** if the grandchild died tonight from `demon_attack` (including Mayor redirects, the Pukka's delayed kill and the Lil' Monsta kill) and she is alive and sober, a review item (default yes) runs `attemptKill(grandmother, grandchild_link)`: protections apply, no Mayor bounce. Not triggered by executions, Assassin, Godfather, Gossip, Moonchild, Slayer, Witch or Gambler deaths, or by day deaths. Impaired: she survives and an abnormal event is logged.
- Reviving the grandchild keeps the link; the link ends if she dies. A player who gains the Grandmother later (Huntsman's Damsel or Philosopher: that same night) learns a grandchild through the same review item, once (`startInfoPending`, section 5.7); the link starts the next night.

#### Huntsman
- Ability: "Once per game, at night, choose a living player: the Damsel, if chosen, becomes a not-in-play Townsfolk. [+the Damsel]"
- Any night until used (including Night 0): 1 living player or "Not tonight". Requires the Damsel in play at setup. Choosing sets the used flag. If sober and the target's actual role is the Damsel, a review item recommends a random enabled Townsfolk not in play and not anyone's believed role; the Admin may pick another. Her role becomes it (good), she gets "Your role is now X" at publish and acts from the next night; a start-information role (Clockmaker, Grandmother) gives her its information that same night (section 5.7). With no Townsfolk left, nothing changes and the Admin sees a warning. Minions are not told.
- The Huntsman is told only "You chose X." Impaired: no change, use spent.

#### Professor
- Ability: "Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected."
- Night 1+ until used: a player dead at the start of the night, or "Not tonight". Choosing sets the used flag. If sober and the target's actual role is a Townsfolk (the Drunk and Marionette are not; an evil-converted Townsfolk is), `revivePlayer`. The revived player is alive for later roles tonight and acts in their slots after the Professor's (section 5.11), so a Sailor, whose slot has passed, does not act that night.
- Told only "You chose X." Impaired: nothing, use spent.

#### Slayer
- Ability: "Once per game, during the day, publicly choose a player: if they are the Demon, they die."
- Resolved in the Day panel; the Slayer must be alive. Resolving spends the shot (except Cancel). If the Slayer is sober and the target registers as the Demon (the Lil' Monsta token holder does; a sober Recluse uses the "registers as" selector; the red herring does not), the day-kill dialog runs (5.12). Otherwise "nothing happens". A Demon death triggers the Scarlet Woman prompt. The app does not announce a win.

#### Cannibal
- Ability: "You have the ability of the recently killed executee. If they are evil, you are poisoned until a good player dies by execution."
- Never wakes as itself. When an execution kills (`onExecution`, with `onExecutionBelieved`), each living holder of the Cannibal's ability other than the executee eats: `eatenAbility = { roleId, fromNight: next night, executeeId, fake }` (5.6).
  - Good executee (actual alignment): their role's ability from the next night, real (`fake: false`). Any Cannibal poison on the holder ends; the role's used flag on the holder is cleared (a fresh Slayer shot); a start-information role gives its information that night (5.7). Hidden: the pickers and results are titled "Cannibal" (5.6), except the Butler's and Zealot's (jinxes, 14.8).
  - Evil executee: no ability (`roleId: null`, `fake: true`), and a real Cannibal is poisoned (cause `cannibal`, `until_removed`) until a good player dies by execution.
  - A Drunk or Marionette who believes they are the Cannibal, or a Philosopher who chose it (from the day after), eats the same way; a believed Cannibal's ability is never real (false information) and they are never poisoned.
  - An execution that doesn't kill changes nothing.
- Day panel (12): the eat and its ability, and a dropdown + Confirm to change it (`set_cannibal_ability { playerId, roleId | null }`, by day only, for a player with the Cannibal's ability, real or believed, who has eaten; not the Cannibal itself). The change keeps whether the eat was real, so an ability given after an evil eat gives false information; it clears that role's used flag and marks start information like an eat.

#### Farmer
- Ability: "When you die at night, an alive good player becomes a Farmer."
- Wakes only on a night they die (like the Ravenkeeper), at its slot (14.1), never by day. A real Farmer sober at the moment of death: a review item `farmer:<pid>`, "who becomes a Farmer?": every alive player whose actual alignment is good, plus Nobody, default a seeded random one who is not a Farmer already (Nobody if all are). The chosen player becomes the Farmer (`changeRole`, `keepAlignment`), acts again from the next night, and is told "You are now the Farmer" with the ability text. Impaired at death, or only believing they are the Farmer: nothing happens (an abnormal event when another character's impairment caused it), and the actor row says so.

#### Fisherman
- Ability: "Once per game, during the day, visit the Storyteller for some advice to help your team win."
- Day ability, never wakes. The Admin gives the advice in person and ticks "Used" in the Ability tracker (`fisherman_used`, not set by the engine); the Day panel reminds them. A Philosopher may gain it (a row of their own in the tracker).

### 14.5 Outsiders (8)

#### Drunk
- Ability: "You do not know you are the Drunk. You think you are a Townsfolk character, but you are not."
- Given a believed Townsfolk role (not in play); wakes at that slot with its input and screens; always impaired (`own_character`). Their device never says "Drunk". Counts as an Outsider.

#### Golem
- Ability: "You may only nominate once per game. When you do, if the nominee is not the Demon, they die."
- Reminder only plus used flag; the Admin marks the death.

#### Recluse
- Ability: "You might register as evil & as a Minion or Demon, even if dead."
- Never wakes. A registration source while sober (5.9), even when dead.

#### Moonchild
- Ability: "When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die."
- The Admin records the target (an alive player) in the Day panel after the Moonchild dies. That night, once per game: if the Moonchild was sober at death and the target is alive and registers good, `attemptKill(target, ability_kill)`. Impaired at death: no effect.

#### Goon
- Ability: "Each night, the 1st player to choose you with their ability is drunk until dusk. You become their alignment."
- Passive in the night walk: the first player tonight (in night order) whose submission includes the Goon (not the Goon themselves; Admin-recorded targets do not count; impaired choosers count), if the Goon is sober: that player gets `drunk` (cause `goon`, `until_dusk`) before their action resolves, and the Goon takes their alignment. Impaired Goon: nothing (abnormal event).

#### Butler
- Ability: "Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too."
- Every night, any player but self. If sober: `butler_master` until dusk (reminder; voting not enforced). Always told "Your master is X."

#### Damsel
- Ability: "All Minions know a Damsel is in play. If a Minion publicly guesses you (once), your team loses."
- Never wakes; an Outsider. Minions (not the Marionette) learn "A Damsel is in play." on Night 0 (section 8).
- The Admin records the evil team's single guess in the Day panel. Correct, and the Damsel alive and sober: banner "The Damsel was guessed: the good team loses. Apply at the table." Damsel impaired or dead: "no effect" banner. Otherwise: "Wrong guess, nothing happens." The app does not end the game. After a Huntsman conversion, a guess at that player is wrong.

#### Zealot
- Ability: "If there are 5 or more players alive, you must vote for every nomination."
- Never wakes. A Day panel reminder only: the voting rule is not enforced.

### 14.6 Minions (12)

#### Mezepheles
- Ability: "You start knowing a secret word. The 1st good player to say this word becomes evil that night."
- Night 0: learns the word. The Admin records the first good player who says it (Day panel). That night, if the Mezepheles is alive and sober, a review item (default convert; skip if the target is dead or not good) turns the target evil (character unchanged) with the notice "You are now evil." The word is spent either way. Impaired: no conversion.

#### Devil's Advocate
- Ability: "Each night, choose a living player (different to last night): if executed tomorrow, they don't die."
- Every night, any player except last night's choice. If sober: `devils_advocate` until dusk (reminder; not enforced).

#### Mastermind
- Ability: "If the Demon dies by execution (ending the game), play for 1 more day. If a player is then executed, their team loses."
- Reminder only.

#### Poisoner
- Ability: "Each night, choose a player: they are poisoned tonight and tomorrow day."
- Every night, any player. If sober: `poisoned` (cause `poisoner`, `until_dusk`).

#### Marionette
- Ability: "You think you are a good character but you are not. The Demon knows who you are. [You neighbour the Demon]"
- Evil, counts as a Minion, given a believed good role (like the Drunk), always impaired (`own_character`; the Mathematician counts their believed ability only as 14.8 says). Told nothing as a Minion and not listed to other Minions; the Demon is told who they are. Setup warns if not next to the Demon. Can be chosen in a starpass (then told their real new role).

#### Scarlet Woman
- Ability: "If there are 5 or more players alive & the Demon dies, you become the Demon. (Travellers don't count)"
- When the Demon dies at night with 5+ alive just before (counting the Demon) and she is alive and sober: review item (default yes); she becomes the dead Demon's role (or takes the Lil' Monsta token) immediately, so later roles see her as the Demon, and gets "You are now the X" with Demon information. Not triggered by a starpass. Day deaths: Admin prompt (section 12).
- **Must not be in the same game as the Vigormortis** (7.3).

#### Assassin
- Ability: "Once per game, at night*, choose a player: they die, even if for some reason they could not."
- Night 1+ until used: any player or "Not tonight". Choosing sets the used flag. If sober: `attemptKill(target, assassin)`, bypassing every protection; the Mayor bounce still applies. Impaired: no death, use spent.

#### Psychopath
- Ability: "Each day, before nominations, you may publicly choose a player: they die. If executed, you only die if you lose roshambo."
- Reminder only; the Admin marks deaths.

#### Godfather
- Ability: "You start knowing which Outsiders are in play. If 1 died today, choose a player tonight: they die. [-1 or +1 Outsider]"
- Setup: −1 or +1 Outsider (7.4).
- Night 0: learns the Outsider characters in play (names of roles; a Drunk is listed as "Drunk"; a Recluse can be hidden via a review item), delivered at publish. "No Outsiders in play." if none. Impaired: a false list (one role swapped for a not-in-play Outsider, or one added if empty), editable.
- Night 1+: triggered when at least one player whose actual role is an Outsider died during the day just ended (`deadAt.phase = day`). The Admin can flip the trigger while collecting (Night tab) or in review. When triggered the Godfather gets a real picker (any player); otherwise "No night action tonight". If sober: `attemptKill(target, ability_kill)` (Mayor bounce applies). A Godfather who keeps an ability after a Vigormortis kill still acts.

#### Witch
- Ability: "Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability."
- Every night including Night 0, while 4+ players are alive at the start of the night (checked every night, nothing stored; revived players can bring it back from the next night). Any player, self allowed. At her slot, if 3 or fewer are alive she does nothing; otherwise, if sober, a `witched` effect (until dusk) on the target. The cursed player is not told; the curse persists if she dies. Day: the Admin presses "They nominated, apply curse" (day-kill dialog, once per curse). The Goon check applies. Told only "You chose X." Impaired: no curse.

#### Organ Grinder
- Ability: "All players keep their eyes closed when voting and the vote tally is secret. Each night, choose if you are drunk until dusk."
- Every night including Night 0, at its slot (14.1): buttons "Drunk until dusk" / "Stay sober" (an `option` field), no decline; no submission counts as sober. Drunk: a `drunk` effect on themselves (cause `organ_grinder`, `until_dusk`), so they are drunk that night and the next day; the Mathematician does not count it (the Organ Grinder causes it). Impaired at their slot: choosing drunk does nothing.
- Day: the Day panel shows "Eyes-closed voting today" while a living player with a real Organ Grinder ability (their role, or one gained, counted with `abilityNightToday`) is not drunk or poisoned as of the last night; checked live, so it goes when they die by day. A believed Organ Grinder never counts. The secret tally and the eyes-closed vote are run at the table (a Day panel reminder).

#### Baron
- Ability: "There are extra Outsiders in play. [+2 Outsiders]"
- Setup only: +2 Outsiders, -2 Townsfolk in the suggested counts (7.4), stacking with every other modifier. Never wakes.

### 14.7 Demons (8)

Common: exactly one Demon at the start. Demon kills are `attemptKill(target, demon_attack)`. Kill roles marked `*` do not act on Night 0. An impaired Demon's kill silently does nothing. A new Demon (starpass, Scarlet Woman) receives Demon information.

#### Imp
- Ability: "Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp."
- Night 1+, any player (self allowed). Starpass (self, sober, and the self-kill succeeds): review item suggesting a living Scarlet Woman, else a random living Minion, listing every living Minion plus "Nobody". The chosen Minion becomes the Imp and gets "You are now the Imp" with Demon information. Impaired: no kill, no starpass.

#### Pukka
- Ability: "Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy."
- Every night, any player. (1) The previous Pukka target, if alive, is attacked (`demon_attack`) and the poison removed, **even if the Pukka is impaired**; (2) if sober, the new target is poisoned (cause `pukka`, `until_source_acts_again`). Night 0 only poisons.

#### Shabaloth
- Ability: "Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated."
- Night 1+, two different players. If sober and any past victim is still dead: a 1-in-3 roll (seeded) recommends a random past victim or nobody; the review item lets the Admin choose any past victim or nobody (shown even when the roll fails). A regurgitated player is revived with `revivePlayer` and acts in their slots later that night (section 5.11). Then both targets are attacked; those who die join the list. Impaired: no kills, no regurgitation.

#### Po
- Ability: "Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight."
- Night 1+. Normally: no one or exactly 1 player. After choosing no one: exactly 3 different players (fewer if fewer exist), no "no one" option. If sober, each is attacked. "Last choice was no one" is stored even when impaired.

#### No Dashii
- Ability: "Each night*, choose a player: they die. Your 2 Townsfolk neighbours are poisoned."
- Night 1+, any player. Continuous: while alive and sober, the closest Townsfolk on each side, alive or dead (skipping only non-Townsfolk), are poisoned (cause `no_dashii`), from Night 0 and recomputed live. A Townsfolk who dies stays poisoned, and the next one along does not become poisoned. Impaired: no kill and no poison.

#### Vigormortis
- Ability: "Each night*, choose a player: they die. Minions you kill keep their ability & poison 1 Townsfolk neighbour. [-1 Outsider]"
- Night 1+, any player. If a Minion dies from its attack: `retainsAbilityWhenDead` (they keep acting while dead) and a review item picks one of the closest Townsfolk on each side of that Minion, alive or dead, to poison (cause `vigormortis`, while the Vigormortis is alive and sober). Impaired: no kill, no effect.
- **Must not be in the same game as the Scarlet Woman** (7.3).

#### Lil' Monsta
- Ability: "Each night, Minions choose who babysits Lil' Monsta's token & "is the Demon". A player dies each night*. [+1 Minion]"
- Deliberately simplified. The **token holder** registers as the Demon for every ability and their death counts as the Demon dying. After Night 0 no player has a Demon role.
- Setup: the plain chart (7.4). The Lil' Monsta player takes the Demon slot and is the extra Minion; the Admin chooses the Minion role they become at publish.
- Night 0: the Lil' Monsta player gets the Demon's information; at publish they become the chosen Minion ("Your role is now X") and hold the token.
- Night 1+: the token holder alone chooses a living Minion to pass the token to (self = keep) and a victim (any player). If sober: the victim is attacked, then the token moves; a new holder is told "You hold Lil' Monsta's token". Impaired: no kill, token stays.
- If the holder dies, the Scarlet Woman check runs; if she takes over she gets the token and keeps her role (the "Lil' Monsta & Scarlet Woman" jinx, 14.8). Otherwise the token stays with the dead holder; the Admin can move it in Grimoire → Game facts.

#### Al-Hadikhia
- Ability: "Each night*, you may choose 3 players (all players learn who): each silently chooses to live or die, but if all live, all die."
- Night 1+: 3 different players, or "No one". Declining (or no input) does nothing and announces nothing.
- At dawn every seated player is told "The Al-Hadikhia chose A, B and C."
- During review, each chosen player in order gets a follow-up question (9.4), key `al_hadikhia:<ahId>:<targetId>`: "The Al-Hadikhia chose A, B and C. Do you choose to live or die?", Live or Die, dead players included. "Accept all defaults" answers none of them; publishing waits unless forced.
- Live revives a dead player (`revive`) and does nothing to a living one. Die is `attemptKill(t, demon_attack)`, so every protection applies. If all three answered and all three are alive afterwards, including anyone whose "die" was stopped, all three are attacked.
- An unanswered question at a forced publish has no effect for that player, and the "if all live, all die" rule needs all three answers. Impaired: the questions are still asked and the choice still announced, with no effect. The actor row says so in both cases.

### 14.8 Jinxes
The official jinxes between roles in the app are the `JINXES` data in `shared/src/roles.ts`: the two roles, the official wording, how the app handles it and the page it was checked against. A change that adds a role adds its jinxes with roles already in the app, in the same change. Every message about a jinx is labelled `Jinx (A & B): …`. The role list (players' Roles tab, Storyteller reference) has a Jinxes section listing each jinx whose two roles are both on the script.

`handling: 'engine'` jinxes are applied by the app, each with a test whose name starts with its label (`server/test/jinxes.test.ts` checks this):
- **Mathematician & Drunk**, **Mathematician & Marionette** ("The Mathematician learns if the Drunk's [Marionette's] ability yielded false info or failed to work properly."): the player is counted when their believed role's ability, tonight, yielded false info (any of their result rows has `finalLines` different from `trueLines`, so the Storyteller sending the truth means not counted), or failed to work (a real, non-declined choice for a role whose result rows, if any, are only confirmations, e.g. a Drunk-Sailor's choice or a Drunk-Professor's revive). The panel lists these as "Drunk's ability failed", so the Storyteller can remove one that would have done nothing anyway.
- **Marionette & Huntsman:** a Marionette who believes they are the Huntsman needs the Damsel in play (blocking Setup item, 7.5).
- **Marionette & Balloonist:** a Marionette who believes they are the Balloonist gets a Setup warning that an Outsider may be added.
- **Lil' Monsta & Scarlet Woman:** already how the Scarlet Woman check works (14.7, Lil' Monsta).
- **Cannibal & Butler**, **Cannibal & Zealot** ("If the Cannibal gains the Butler [Zealot] ability, the Cannibal learns this."): when the Cannibal gains it (an eat, or the Storyteller's Confirm in the Day panel), a notice "Jinx (Cannibal & Butler): You have the Butler ability" with the ability text is queued and delivered when the next night starts, once. Changing the ability again the same day withdraws it. The eaten Butler's picker is titled "Butler", not "Cannibal".
- **Scarlet Woman & Al-Hadikhia** ("If there would be two Demons, one of which was the Scarlet Woman, the Scarlet Woman becomes the Scarlet Woman again."): after any revive (at night, or the Storyteller's `mark_alive`), if two Demons are alive, one an Al-Hadikhia and one who became the Demon from the Scarlet Woman, she changes back (`changeRole`, `keepAbilities`, `keepTies`), is told "Jinx (Scarlet Woman & Al-Hadikhia): You are the Scarlet Woman again" with her ability text, and at night the actor row says so.
- **Al-Hadikhia & Mastermind** ("If the Al-Hadikhia dies by execution, and the Mastermind is alive, the Al-Hadikhia chooses 3 good players tonight: if all 3 choose to live, evil wins. Otherwise, good wins."): the night after the Al-Hadikhia died by execution, with a living player who has a real Mastermind ability and no other living Demon (the execution ended the game), the dead Al-Hadikhia wakes with a picker of 3 actually-good players (`wakesDead`) and is an expected actor. Each gets the Live/Die question, nothing dies, and the actor row shows "evil wins" if all three chose to live, else "good wins". The app doesn't end the game: the Storyteller applies it at the table. An impaired Mastermind gets a note on the row. The dawn notice is sent as usual.
- **Cannibal & Juggler** ("If the Juggler guesses on their first day and dies by execution, tonight the living Cannibal learns how many guesses the Juggler got correct."): already how it works: eating the Juggler on day 1 gives the Cannibal the Juggler's ability from night 1, which wakes on night 1 with that day's count (titled "Cannibal").

The rest are `'reminder'`: shown in the role list only, applied by the Admin at the table. They include **Butler & Organ Grinder** ("If the Organ Grinder is causing eyes closed voting, the Butler may raise their hand to vote but their vote is only counted if their master voted too."; Djinn page, revision 3106).

---

## 15. Screens summary

| Screen | Audience | Key elements |
|---|---|---|
| Join | Player | Name, preference, admin checkbox; rebind by name |
| Lobby | Player | Names, waiting message, Become Storyteller (if none) |
| Roles / Order / Seats | Player | Enabled roles; role night order; seat order with dead in red (dawn snapshot) |
| My role | Player | Tap-to-reveal card and starting information |
| Night | Player | Countdown, real picker or "No night action" + Continue, games after submitting, follow-up questions (Ravenkeeper) |
| Day | Player | Dawn banner, own information, "You have died" |
| Admin: Lobby | Admin | Players, presence, rename/remove, QR join |
| Admin: Setup | Admin | Checklist, seating, assignment, decisions, counts, role checklist |
| Admin: Night | Admin | Submission board, countdown, submit-for, Godfather trigger, resolve |
| Admin: Review | Admin | Decisions, results, Mathematician, night walk, publish |
| Admin: Day | Admin | Deaths, execution, facts, day abilities, Ability tracker, start night |
| Admin: Grimoire | Admin | Everything about every player, game facts, settings |
| Admin: Circle | Admin | Table view with roles and statuses |
| Admin: Story | Admin | Per-night and per-day record |
| Admin: Log / Reference | Admin | Event log; role list and order |

---

## 16. Deployment and development

- Multi-stage `Dockerfile`: the client and server are built and the test suite runs on the build machine's architecture; only `better-sqlite3` is installed per target architecture. The runtime image is `node:22-bookworm-slim`. Published to `ghcr.io/arkinect/clocktower` for linux/amd64 and linux/arm64 (`:edge` from `main`, `:X.Y.Z`/`:X.Y`/`:latest` from tags).
- `docker-compose.yml` (internet-facing): `clocktower` (the app) and `clocktower-caddy`.
  - **App:** own data (`./data`), its own Docker network, no published port, non-root (uid 1000), read-only filesystem, all capabilities dropped, memory/process limits, `TRUST_PROXY=1`, and a shared password.
  - **Caddy** is the only way in: HTTPS for `CLOCKTOWER_DOMAIN` with an automatic Let's Encrypt certificate (HTTP or, optionally, TLS-ALPN over 443 only). It runs as uid 1000 on unprivileged ports 8080/8443 inside the container (host 80/443 by default) with only the bind-ports capability. It sends no HSTS header, because HSTS applies to the whole host name (every port) and would force HTTPS on other services on the same name.
- LAN-only use: `docker run -p 8080:8080 -v ./data:/data ghcr.io/arkinect/clocktower` (no password, plain HTTP).
- Env vars: `PORT` (8080), `DATA_DIR` (`/data`), `DEFAULT_GAME_CODE` (`default`), `PUBLIC_URL` (used for the Storyteller's join QR code; otherwise the browser origin), `SITE_PASSWORD`, `TRUST_PROXY`.
- `/healthz` endpoint. Behind any reverse proxy, WebSocket upgrades on `/ws/` must be allowed.
- **Shared password** (only when `SITE_PASSWORD` is set): players enter it once per device before the Join screen; it is required for the name list, joining and rebinding by name (a device holding that player's login cookie may rebind without it). 10 wrong passwords from one address lock it out for 15 minutes. Login cookies are marked `Secure` over HTTPS. Players already joined are not asked again.
- Updates: `scripts/update.sh` pulls the latest images and recreates changed containers (suitable for cron). Phones refresh to pick up a new client.
- Development: Node 22 and npm, or `./dev.sh <cmd>` to run them in a container. `scripts/smoke.mjs` is an end-to-end test against a running server without a password.

---

## 17. Final decisions

| Topic | Decision |
|---|---|
| Admin | One fixed Admin, no transfer, never reveals the grimoire to players |
| Lost device | Rebind by picking a name |
| Dead players' phones | Keep the role list, night order, their role card and the night games |
| Deaths seen by players | Red names from a dawn snapshot; no public death list |
| Deaths seen by the Admin | Immediate, red names everywhere |
| Night screen | Real picker for real choices; otherwise "No night action tonight" + Continue (no decoys) |
| Night games | Locked until the player submits; Lantern Slice and 2048 (Night Flight kept but unused) |
| Night pickers | Include dead players (except the Sailor, Devil's Advocate, Huntsman, Lil' Monsta pass-to and the Professor) |
| Minion information | Minions (not the Marionette) learn each other on Night 0, not the Demon. The Demon learns the Minions, the Marionette and the bluffs. |
| Damsel notice | Minions (not the Marionette) learn a Damsel is in play, not who |
| Vigormortis + Scarlet Woman | Never suggested together; manual assignment shows a setup warning about known bugs |
| Role preference | Collected at join, shown only as the default label in Setup assignment |
| Type distribution | Admin may set counts, otherwise the default chart and role modifiers |
| Marionette | Admin told at setup; Demon told; believed good role not in play; adjacency warns |
| Drunk | Admin chooses the believed Townsfolk |
| Red herring | App recommends, Admin may choose any good player |
| Clockmaker | Shorter way around the circle, all seats counted |
| Sailor | 50/50 coin recommends who is drunk, Admin accepts or picks the other |
| Mathematician | Since dawn, day included: impairment by another character, the asker of a Recluse misregistration, and the Drunk and Marionette jinxes; false values capped, the Drunk and Marionette included |
| Balloonist | Names only |
| Philosopher | Gained ability from the night it is chosen (input as a follow-up question at its slot); the holder is drunk only while the Philosopher is alive and sober; cannot choose the Philosopher |
| Goon | Any submission that includes the Goon counts, even from an impaired player |
| Mezepheles | First word only; word spent even if impaired |
| Scarlet Woman | Alive count includes the dying Demon; by day she is told at the next night start |
| Mayor | 50/50 recommendation, Admin chooses any outcome; redirects may hit protected players and still go through protections |
| Pukka | Impaired Pukka still kills its previous target but poisons no one new |
| Shabaloth | 1-in-3 regurgitation of any past victim, recommended then Admin chooses |
| Po | None or exactly one; after none, exactly three |
| No Dashii, Vigormortis | The closest Townsfolk on each side count as neighbours, alive or dead; Vigormortis poison lasts while it is alive and sober |
| Lil' Monsta | Simplified token model; holder passes alone; token stays with a dead holder unless the Scarlet Woman takes it |
| Flowergirl, Juggler | Admin enters the day value |
| Oracle | Dead evil players at its slot; false values 0 to the number dead |
| Gossip | Admin judges; Gossip alive at its slot; random victim recommended; protections and Mayor bounce apply |
| Grandmother | Recommended good grandchild (not the Drunk); impaired Night 0 = no grandchild; dies on a Demon-attack death of the grandchild if sober; protections apply |
| Huntsman | Never told whether it worked; converted Damsel acts from next night |
| Professor | Players dead at night start; actual Townsfolk only; revived player acts in their slots later that night |
| Revive | One shared function (Professor, Shabaloth, Admin) |
| Godfather | Learns Outsider characters at Night 0 (publish); trigger = an Outsider died in the day, Admin can flip; −1/+1 Outsider, Admin chooses |
| Witch | Works only while 4+ alive at her slot; curse persists if she dies; applied by the Admin in the day |
| Day kills (Slayer, Witch) | Protections apply except Mayor and Innkeeper; Admin confirms every one |
| Slayer | Shot spent either way; kills only a target that registers as the Demon |
| Damsel guess | One per game for the evil team; app shows the outcome, does not end the game |
| Once-per-game tracking | Assassin, Seamstress, Philosopher, Huntsman, Professor automatic; Virgin, Golem, Artist, Fool, Slayer, Damsel guess in the Ability tracker |
| Story and Circle | Admin only |
| Existing games | Keep loading through schema migrations |

---

## 18. Tests

347 automated tests (`./dev.sh npm test`: 326 server, 21 client), all passing:
- **Original worked examples:** poison makes false info; sober Sailor survives, poisoned Sailor dies; Innkeeper protects but not from the Assassin; Mayor tails redirect (may land on a protected player); Clockmaker 7 seats Demon 1 Minion 5 → 3; Goon; Po none then three; starpass suggests the Scarlet Woman and the Admin picks another; Shabaloth regurgitation; Lil' Monsta flow and the Fortune Teller reading the new holder; reconnect and rebind.
- **Per-role tests** for every role with a night effect (true, impaired, registration cases), setup blocking, role reassignment, Ravenkeeper second round, Scarlet Woman night and day.
- **Al-Hadikhia:** off the script it is never offered; the picker; declining; the questions and their order; "Accept all defaults" answers nothing and publishing waits unless forced; die, live revives, all-live kills all three, a Tea Lady-protected "die" counts as alive; a revived player killed again isn't told they are alive; impaired; reopening clears answers; a forced publish with a missing answer; dead players answer; the dawn notice; Live/Die reaches only the asked player; both jinxes; the night-order slot.
- **Follow-up questions:** the question's key and spec and the timer extension, "Accept all defaults" leaves a question unanswered, re-opening collecting clears answers, the Storyteller answering for a player, only the asked player answering once with a legal choice, the v7 step.
- **Abilities:** one test per source (own role; a Drunk or Marionette has their actual role's ability but not the believed one's; a Drunk believing the Empath wakes as it without the ability; a Philosopher's ability from `fromNight`; the Lil' Monsta token from night 1); the Cannibal's eaten ability for a real, Philosopher-gained, Drunk and Marionette Cannibal (the eaten role from `fromNight`, `real` only for a real Cannibal's non-fake eat, nothing for a fake eat's ability or no ability), and its "Cannibal" title and `cannibal` key on pickers, submissions, messages and follow-up questions except for the Butler and Zealot, with the eaten role's id appearing nowhere in the player's view, while the admin view's result row keeps the eaten role ("Cannibal (as Fortune Teller)").
- **Jinxes:** every jinx names two roles in the app and no pair twice; every `engine` jinx has a test named after its label; label and lookup helpers; the Marionette & Huntsman Setup item, the Marionette & Balloonist warning, and the Scarlet Woman taking Lil' Monsta's token; the role list's Jinxes section (client).
- **Philosopher day abilities:** a Philosopher who chose the Slayer can shoot on the very next day (and only once), not before choosing, and the real Slayer is drunk that day; choosing another ability does not make them a Slayer. The day after choosing, a Philosopher-Sailor or -Fool survives the Witch's curse, a Philosopher-Tea Lady protects a good neighbour, a Philosopher-Recluse can register as the Demon to the Slayer, and a Philosopher-Moonchild executed by day has their sobriety recorded.
- **Role changes and hooks:** `changeRole` for every combination of its options, to no role and for a player with no assignment; the eaten ability is kept only with `keepAbilities`, and `keepAlignment`; the `onExecution` hook runs once per holder of the real ability (including the executee) only when an execution kills, and for believed holders, with `real: false`, only when the role opts in.
- **Fisherman, Zealot, Baron, Organ Grinder:** a script without them never offers them (picker options, bluffs, assignment, suggested distributions, a game saved before they existed); the Baron's counts alone and with the Godfather (±1, decided after the other modifiers, and accepted or refused accordingly), Vigormortis and Balloonist; the Organ Grinder's choice (drunk until dusk with its own cause, sober, no submission as sober, an illegal answer refused), eyes-closed voting only while alive and sober (not when drunk, poisoned, dead or only believed); (client) a Philosopher's gained Fisherman gets a tracker row, a believed one doesn't, the Fisherman, Zealot and Organ Grinder reminders, and the banner.
- **Cannibal:** off the script it is never offered; a good eat used the next night under the title "Cannibal"; an evil eat poisons until a good player dies by execution (not through a non-killing execution); a non-killing execution keeps the old ability; a dead or executed Cannibal eats nothing; a used Slayer flag cleared by a Slayer eat; an eaten Grandmother or Clockmaker gives its information the next night; a Philosopher who chose the Cannibal eats the next day; a Drunk- and Marionette-Cannibal wake as the eaten role with false information and are never poisoned; `set_cannibal_ability` (who, when, which roles; kept not real after an evil eat; changing a good eat; clearing); the three jinxes (Butler notice once, on an eat or Confirm only, withdrawn on a change; Zealot notice; the Juggler on day 1 and not later); (client) the Day panel's Cannibal rows, summary and dropdown.
- **Farmer:** a night death makes the chosen alive good player a Farmer who stays good, is told, and doesn't act again that night; the default never picks a Farmer (Nobody when only Farmers are left); Nobody; a day death, an impaired Farmer and a Drunk-Farmer do nothing; the Farmer's night-order slot.
- **Night order:** the constraints in 14.1 on both orders, every resolving role has a slot, every slot's role exists once, start-information roles have slots in both orders and the just-gained-only Clockmaker slot sits by the Grandmother's.
- **Start information:** a Philosopher who chooses the Clockmaker learns the distance that same night (night 0 or later), once; poisoned after choosing, false information and the mark still clears; the Huntsman's Damsel turned Clockmaker learns it that night, once; a Philosopher-Grandmother learns a grandchild that night with no link until the next night; other gained abilities still start the next night; the Clockmaker otherwise wakes on night 0 only.
- **New-role worked examples:** Oracle (and after a Professor revive), Gossip (True/False/poisoned/killed earlier), Huntsman, Professor (Townsfolk only, not tonight's victims, Shabaloth list cleared), Slayer (kill, poisoned, red herring), Damsel (notices, banner, single guess), Godfather (info, trigger, counts ±1), Witch (curse, 3 alive, poisoned), Huntsman setup guard, Mathematician cap, Grandmother (link, Assassin no link, poisoned no grandchild), identical revives.
- **Owner changes:** dead players in pickers, Vigormortis + Scarlet Woman, Balloonist names only, story contents (impairment, targets, information received) and Admin-only, Minions knowing each other, dawn snapshot of deaths.
- **Updates:** last progress counts joins but not rebinds, an empty lobby is safe to restart at any age and is deleted (and noted in the `migrations` row) by the startup upgrade while a lobby with players is ended, the 4-hour abandoned rule, when a restart is safe, the status reply has no player details, the loopback check; the startup upgrade (in-progress games ended as abandoned or by the update, ended games kept and playable again, one backup, a second startup changes nothing, a failing step rolls back, too-new and too-old saves refused; one `migrations` row per upgrade and none otherwise; the startup line; each v4, v5 and v7 fixture upgrades to a stored expected state; a v7 build refuses a v8 game with `Not starting: …` and changes nothing; the v8 step only stamps the version, and an upgraded v7 game plays again), using v4 fixtures built by the v0.2.2 engine and v5 fixtures built by the withdrawn v0.3.0 engine at 9606d63 (`server/test/fixtures/`): an ended game with the Baron and Organ Grinder assigned and a Fisherman bluff, and a game left mid-day, both upgrade with no stored id of the four roles; the v5 step changes nothing on v4 data but the ended game's last night. v7 fixtures are built by the engine at b9d25f0 (`generate-v7.ts`): an ended game with a Philosopher-Grandmother and a Ravenkeeper's follow-up, and a game left mid-day with the Grandmother information still pending.
- **Script:** the v6 step, a new game has every role on, toggles and All/None, Play again keeps the script, an unknown id is left out of views, assignment, bluffs and the Setup checklist.
- **Intent shapes:** for every intent type, each field with the wrong type is rejected as `Bad request.` with no state change or event; missing fields, unknown players, unknown types and non-objects are rejected; every intent the test helpers send must be well-formed; an `option` answer is its id as a string (a label or non-string is not).
- **Ended screen** (client, rendered with `react-dom/server`): each `endedReason` message, and none when the Storyteller ended the game or an older server sends no reason; the update bar offers a reload and a dismiss button; an `option` field renders as buttons (labels, else ids), and an unknown field kind as a dropdown of ids.
- **Day panel role data** (client): the Ability tracker's used flags, the day reminders and the impairment-cause names derived from `shared/src/roles.ts` match the lists the Day panel used to hard-code.
- **Randomised games:** 60 random 5–15 player games of 5 nights each with random legal choices, checking no crashes and no hidden information in any player view (a one-off 400-game run was also clean).
- **End-to-end:** `scripts/smoke.mjs` over HTTP and WebSocket against a running container.

UI changes are checked in headless Chromium at phone size (390×780). Not yet tested on real phones.

---

## 19. Decisions log (gaps filled during implementation)

Rule gaps (already folded into the cards above, listed here for review):
- Only a sober Recluse produces registration choices; one choice per asker and Recluse.
- Balloonist never shows themselves; impaired picks do not mark a type shown.
- Empath counts a lone other alive player once; Tea Lady needs two different alive neighbours.
- Gambler's self-kill goes through protections, no Mayor bounce.
- Mayor's recommendation never redirects to the attacker.
- No Dashii, Vigormortis, Shabaloth and Po may target themselves; Po with fewer than 3 players chooses as many as exist.
- Starpass has a "Nobody" option; a starpass does not also trigger the Scarlet Woman check.
- Scarlet Woman transforms immediately at the Demon's death during the night walk.
- Mezepheles: dead or non-good targets default to "Skip".
- Moonchild uses its sobriety at death (night or day); target must be alive when recorded.
- Philosopher always gets a confirmation; drunk applies only to actual holders of the chosen role.
- Butler always gets "Your master is X".
- Lil' Monsta's token notice only when the token changes hands; a holder with a Minion night ability gets both pickers.
- Revived players act in their later slots that night, asked for any input as a follow-up question (Professor, Shabaloth, the Al-Hadikhia's "live"). Players given a new role do not act for the rest of that night; a Damsel turned Grandmother learns her grandchild that night.
- Day kills use true alignments for the Tea Lady; the Slayer's Recluse choice is a selector in the Day panel.
- Pressing the Witch curse button uses up the curse whatever the dialog choice (except Cancel).
- A dead Damsel being guessed counts as "no effect".
- The Godfather ±1 choice must be made once (suggestions assume +1 until then).
- The Godfather's −1/+1 is decided from the Outsider count after the other setup modifiers, not the default chart: with 7 players and the Baron the Storyteller can choose 1 or 3 Outsiders; with 8 players and the Vigormortis, only +1.
- The Organ Grinder's choice: no submission counts as sober; an impaired Organ Grinder choosing drunk gets no effect (like any impaired ability); their own drunkenness is not abnormal for the Mathematician.
- Eyes-closed voting is checked live during the day: it ends when the Organ Grinder dies by day, and uses impairment as of the last night.
- A start-information role gained later gives its information once, the night it is gained (a Philosopher's choosing night, the Damsel's night; the Cannibal's the night after the execution); impaired, it is false and still used up. A Philosopher-Grandmother's link starts the next night, like any gained ability. A player who can't act that night (dead) keeps the mark until they can.
- The Cannibal's eaten ability comes after a Philosopher's gained one in waking order; a Philosopher-Cannibal has it only once both are active. A believed Cannibal (Drunk or Marionette) wakes as the eaten role with no real ability; an eat from an evil executee is never real, even for the real Cannibal.
- A hidden eaten ability goes by "cannibal" in titles, keys and role ids sent to the player; the picker's prompt and field labels are the eaten role's own (the player may work the role out from what they are asked, as at a real table). The script (`enabledRoles`, the same for every player) still lists every role id. Notices are not renamed: no role today sends a notice naming itself to its own player.
- When one role comes from two sources (e.g. an eaten Empath on an Empath), the first source decides the title and key, so it is never hidden.
- The Cannibal eats even when drunk or poisoned at the execution (the eaten ability is then impaired while they are); the Storyteller can change it in the Day panel. Eating the Drunk gives the Drunk's "ability", which does nothing here.
- Re-recording the day's execution does not undo an eat: a new killing execution eats again (replacing it), and anything else is fixed with the Day panel's Cannibal row. Marking the executee alive again does not undo it either.
- The Cannibal & Juggler jinx is applied only for a Juggler executed on day 1 (their ability wakes only on night 1). A Juggler eaten on a later day gives nothing; the Storyteller applies anything else at the table.
- The Cannibal's poison after an evil eat is the Cannibal's own ability, so it is not abnormal for the Mathematician.
- A Mathematician's "failed to work" for a Drunk or Marionette is recorded for any real choice with no information back, even one that would have done nothing (a Gambler's right guess); the Storyteller removes those in the panel.
- The Farmer's new Farmer is any alive player whose actual alignment is good (a Recluse included), and keeps their alignment; with only Farmers left the default is Nobody. A Farmer impaired at death, or a Drunk or Marionette who thinks they are the Farmer, makes nobody a Farmer: the review screen's actor row says so, and no review item is shown.
- A real Farmer who dies after the Farmer's slot (the Moonchild's target, a Grandmother's link) acts once the night order has finished, with the same options, default and outcome (`alsoAfterOrder`). That includes a Farmer made earlier the same night. The Mathematician has already counted by then, so an impaired Farmer's abnormal event in that case is listed on the review screen but not in their number.
- The Ravenkeeper and the Farmer wake if they are dead now and died tonight: revived later the same night they don't, and revived and then killed again the same night they do.
- The Al-Hadikhia's dawn notice names the choice only. The official "How to Run" also declares who is alive and dead at dawn; the Storyteller does that at the table, like other public deaths (3.5).
- Al-Hadikhia & Mastermind applies only if the execution ended the game: if a Scarlet Woman took over the Demon, or any other Demon is alive, the dead Al-Hadikhia doesn't wake and the living Demon acts normally. Its dawn notice is sent like any other Al-Hadikhia choice. With fewer than 3 good players the picker can be declined and the actor row leaves it to the Storyteller.
- Al-Hadikhia & Princess (official) is not in `JINXES`: the Princess isn't in the app.
- A player revived and killed again the same night (Live, then "all die") is listed as both revived and dead on the review screen, and gets neither "You are alive again" nor "You died in the night" if they were dead at dusk.
- An eaten Juggler wakes only if the Storyteller entered a count for day 1: with none there is nothing to learn. The real Juggler always wakes on night 1 (the count defaults to 0).
- A Philosopher who chose the Cannibal eats from the day after choosing (abilities counted with `abilityNightToday`, like the Slayer's shot).
- A Philosopher-Cannibal who eats the executed real Cannibal gains nothing new: they already have that ability, and whatever they ate before is replaced as usual.
- A Cannibal who chooses an ability as the eaten Philosopher keeps it only while they have the Philosopher's ability. When the eaten ability changes to anything else (a new eat, or `set_cannibal_ability`), the gained ability goes, with its pending start information and the drunkenness it caused, so that character is sober again. A gained Cannibal stays (it is the ability that eats). Changing back to the Philosopher does not restore any of this: they may choose again.

Interpretation and UX choices:
- Game state persisted as one JSON document per game (logical data model in 5.6).
- Role cards hidden until Night 0 begins.
- Night results and notices cleared at the next night start; starting information kept.
- A Scarlet Woman who becomes the Demon by day is told when the next night starts; a player marked dead by day is told immediately.
- Renaming/removing players allowed in Setup as well as Lobby; "New game (erase)" added.
- Pickers are dropdowns; drag-to-reorder seating works with a mouse, ↑/↓ on phones.

Known limits:
- No undo or replay from the event log.
- No per-option preview in review items (results update live after a choice).
- Day abilities other than the Slayer, Witch curse and Damsel guess are reminders only.
