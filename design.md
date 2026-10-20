# Blood on the Clocktower Night Assistant: Design Document

Version: 4. Scope: the 48 roles listed in section 14.
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
- Roles other than the 48 in section 14. Roles are data, so more can be added later.
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
- Setup: role checklist, seating, role assignment, type counts, setup decisions, the checklist that gates Night 0, and the Storyteller briefing (section 7).
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
- `GameState.schemaVersion` (currently **4**). On load, `migrate()` upgrades older saves:
  - v1 → v2: add the 9 new roles as enabled; old string `deadAt` values become `null`; add `deathCause`, `gossipStatement`, Godfather/Damsel setup fields.
  - v2 → v3: drop the removed Balloonist setting; add an empty `story`.
  - v3 → v4: add `publicDead` (current dead if the game has started).

### 5.6 Data model (logical)
- `Game(id, code, phase, nightNumber, dayNumber, settings, nightEndsAt, enabledRoles, adminId, seatingPublished, publishedSeating[], publicDead[], story[], schemaVersion)`
- `Player(id, name, rolePreference, isAdmin, seat, tokens[], alive, deadAt {phase: night|day, number} | null, deathCause, ghostVoteUsed, hasSeenRole, lastSeenAt)`
- `Assignment(playerId, roleId, believedRoleId, alignment, retainsAbilityWhenDead, grantedAbility {roleId, fromNight} | null, history[])`
- `Flags(playerId, key)`: `philosopher_used, seamstress_used, assassin_used, huntsman_used, professor_used, slayer_used, fool_used, virgin_used, golem_used, artist_used`
- `RoleState(playerId, ...)`: per-role memory such as `lastTarget` (Devil's Advocate), `lastChoiceNone` (Po), `shownTypes` (Balloonist), `grandchildId` and `grandmotherInfoPending` (Grandmother), `soberAtDeath` and `moonchildUsed` (Moonchild)
- `Effect(id, type, cause, sourcePlayerId, targetPlayerId, startNight, expiry)`; `type` in `poisoned | drunk | protected | devils_advocate | butler_master | witched`; `expiry` in `until_dusk | until_source_acts_again | while_source_alive_and_sober | until_removed`; `cause` in `poisoner | sailor | innkeeper | goon | philosopher | pukka | no_dashii | vigormortis | witch | admin` (used by the Mathematician).
- `Setup(demonBluffs[3], redHerringId, lilMonstaMinionRole, lilMonstaTokenHolderId, mezephelesWord, mezephelesSpent, typeCountsOverride?, shabalothKills[], godfatherOutsiders (1 | -1 | null), damselGuessUsed, damselGuessResult)`
- `DayRecord(dayNumber, executedPlayerId, demonVoted, jugglerCorrect, moonchildTargetId, mezephelesSayer, gossipStatement (none|true|false), notes)`
- `NightState(number, collectingOpen, submissions{}, ravenSubmissions{}, seed, reviewChoices{}, overrides{}, mathAdjust, resolution)`
- `Resolution(actors[], results[], reviewItems[], log[], deaths[], revived[], abnormal[], awaitingRavenkeeper[], notices[], after: World)`
- `Messages(playerId -> [{title, lines, night, kind: result|notice|starting}])`, `PendingNotices` (delivered when the next night starts), `DayPrompts` (Scarlet Woman day prompt)
- `Story`: see section 13.3.

### 5.7 Role definitions
Static data in `shared/src/roles.ts` (`id, name, type, alignment, abilityText, setupModifier?, reminder?`) and both night orders as editable tables. Behaviour in `server/src/engine/roles/index.ts`, one module per role:

```ts
interface RoleBehaviour {
  wakes?(ctx): boolean;            // extra condition for waking tonight
  spec?(ctx): ActionSpec | null;   // the player's input tonight (null = wakes without input)
  resolve?(run, actor): void;      // effects, kills, results, review items
  actsWhileDead?: boolean;         // Ravenkeeper, Moonchild, Gossip
}
```

The night-order reference shown to players is generated from the order tables, never hand-written separately.

### 5.8 Impairment
`computeImpairment(world, night)` returns, per player, `{ impaired, causes[] }`. Roles read impairment only from this function.
- A player is impaired if any active `poisoned` or `drunk` effect applies, or their actual role is Drunk or Marionette (cause `own_character`).
- Two passes: first the unconditional effects; then effects that depend on their source being alive and sober (`while_source_alive_and_sober`, e.g. Vigormortis poison) and the derived No Dashii poison (nearest alive Townsfolk on each side of a sober, alive No Dashii).
- A Philosopher's drunk effect ends when the Philosopher dies.
- Effects are applied as the night order is walked, so a role that wakes later sees effects created earlier tonight.
- `until_dusk` effects are cleared when the next night starts. Poison "tonight and tomorrow day" is `until_dusk`.

### 5.9 Registration
Only a **sober Recluse** (alive or dead) is a registration source with an Admin choice. When an ability asks about a Recluse, the engine creates a review item for that asker and that Recluse: "Truthfully (good Outsider)", "As an evil Minion" or "As an evil Demon" (default truthful); for "which character?" (Ravenkeeper) the options are truthful or any enabled Minion/Demon. The choice applies to that query only. A non-truthful choice logs an abnormal event for the Mathematician.
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
`revivePlayer(playerId)` is the only way a player comes back (Professor, Shabaloth, Admin "Mark alive"): alive again, `deadAt` and `deathCause` cleared, ghost vote restored, removed from `shabalothKills`, `retainsAbilityWhenDead` cleared, pending Moonchild data cleared. It fires no death trigger. The player is told "You are alive again" (at publish for a night revive, immediately for a day revive). A player revived or given a new role during a night **does not act for the rest of that night** (exception: a Damsel turned into the Grandmother learns her grandchild that same night).

### 5.12 Day kills
`previewDayKill(target)` for the Slayer shot and the Witch's curse runs the normal protections except the Mayor bounce and the Innkeeper (both night only): sober Sailor, Tea Lady (true alignments, no Recluse prompt), unused sober Fool. The Admin sees the outcome in a dialog ("X would die", "X cannot die because …") with **Accept, Cancel, Force death, Force survive**. On confirm the death is recorded with `deadAt = {day, n}` and the normal triggers fire (Scarlet Woman prompt, Moonchild sobriety, Fool used flag, immediate "You have died" notice).

### 5.13 Resolution algorithm

```
resolveNight(state):                      // pure; clones the world
  if a Godfather can act on Night 1+: review item "godfather_trigger"
  for slot in nightOrder(night):          // 14.1 or 14.2
    for actor in actors(slot):            // acting role = believed role (Drunk/Marionette),
                                          // actual role, Philosopher-gained role (from the next
                                          // night), Lil' Monsta token; dead actors only if they
                                          // keep an ability, or Ravenkeeper/Moonchild/Gossip rules;
                                          // skips players revived or converted earlier tonight
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
- All 48 roles grouped by type with a checkbox each (default all enabled), plus All/None.
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
- **Lil' Monsta**: +1 Minion.
- **Godfather**: −1 or +1 Outsider, chosen by the Admin (default +1). Only +1 is allowed when the chart has 0 Outsiders for the player count.

**Admin override:** four number inputs that must add up to the player count, with "Reset to default chart". Modifiers apply only to the default chart. The Drunk counts as an Outsider, the Marionette as a Minion, the Damsel takes an Outsider slot. Counts are advisory: mismatches only warn.

### 7.5 Setup checklist (gates Night 0) and Storyteller briefing
Required items appear as roles are assigned; **Begin Night 0** is enabled when all are done (or forced with a warning):
1. Everyone seated; every seated player has a role (exactly one Demon is a non-blocking check).
2. **Drunk:** choose the believed role (an enabled Townsfolk not in play and not another player's believed role).
3. **Marionette:** choose the believed role (an enabled good role not in play). The app warns if the Marionette does not sit next to the Demon.
4. **Fortune Teller:** the red herring. "Recommend" picks a random good player who is not the Fortune Teller, Recluse or Drunk; the Admin may choose any good player.
5. **Demon bluffs:** exactly 3 good roles not in play and not anyone's believed role ("Suggest random" prefers Townsfolk).
6. **Mezepheles:** the secret word (random from a built-in list of over 250 simple nouns, or typed).
7. **Lil' Monsta:** the Minion role the Lil' Monsta player becomes (enabled, not in play).
8. **Godfather:** Outsiders −1 or +1 (must be pressed once).
9. **Huntsman:** needs the Damsel in play.

The **Storyteller briefing** (Setup and Grimoire) lists: the Drunk and Marionette with believed roles, Lil' Monsta details, the red herring, bluffs, the Mezepheles word, the Damsel (and any Huntsman conversion), the Outsiders the Godfather will learn, the evil team, and the reminder that Minions learn each other but not the Demon.

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
- **Mathematician panel** (if one acted): detected abnormal players with checkboxes, and players to add.
- **Night walk**: every actor in order with input, impairment and outcome. Deaths and revivals.
- **Reopen collecting** and **Publish and send to Day**.

### 9.4 Ravenkeeper second round
If a Ravenkeeper (or a Drunk/Marionette who believes they are one) dies tonight, their phone shows "You have died. Choose a player" with every player listed; the countdown is extended by `ravenkeeperExtensionSeconds` (default 120) and the Admin sees "Waiting for Ravenkeeper" with Submit-for. Their result uses their impairment at the moment of death. Publishing without their choice sends them no information.

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
- Submissions are accepted only while collecting (or for the Ravenkeeper second round) and only for roles that act on this night number. A player without a real action can only acknowledge (any content is discarded, with an identical response).
- **Dead players appear in night pickers.** Abilities can be wasted on dead players ("already dead" for kills). Exceptions: Lil' Monsta's "pass the token to" lists only living Minions; the Professor lists only players dead at the start of the night. The Admin's own pickers (Moonchild target, Gossip victim, Mayor redirect) list alive players.
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
| Record Damsel guess (once per game for the evil team) → banner: win / no effect / wrong, with **Retract guess** (clears the record; nothing is ever sent to players) | Damsel |
| Notes | Story |

- **Scarlet Woman prompt:** when the Demon is marked dead in the day with 5+ alive and a sober Scarlet Woman alive, a prompt asks whether she becomes the Demon. On yes her role changes immediately (grimoire) and she is told when the next night starts.
- **Ability tracker:** chips "Unused/Used" for Virgin, Golem, Artist, Fool and Slayer (Admin toggles; the engine sets the Fool and Slayer itself), automatic chips for Assassin, Seamstress, Philosopher, Huntsman and Professor, and "Guess unused/used" for the Damsel guess (resettable).
- **Reminders:** Devil's Advocate protection, Butler's master, Witch's curse, the Fool, and day-only role reminders.
- Day-only abilities (Virgin, Golem, Artist, Mastermind, Psychopath, Mayor's 3-player win, Butler vote restriction, Devil's Advocate execution protection, Fool surviving an execution) are **not enforced**; the Admin applies them at the table.

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

### 14.1 Night 0 order (enabled and in-play roles only)

| # | Slot | Notes |
|---|---|---|
| 1 | Philosopher | |
| 2 | Demon Info | Delivered up front (section 8). Minions learn each other. |
| 3 | Sailor | |
| 4 | Poisoner | |
| 5 | Godfather | Learns the Outsiders in play (delivered at publish) |
| 6 | Devil's Advocate | |
| 7 | Witch | |
| 8 | Mezepheles | Word delivered up front |
| 9 | Pukka | |
| 10 | Huntsman | |
| 11 | Damsel | Minions' "A Damsel is in play" notice, delivered up front |
| 12 | Clockmaker | |
| 13 | Empath | |
| 14 | Fortune Teller | |
| 15 | Seamstress | |
| 16 | Balloonist | |
| 17 | Butler | |
| 18 | Grandmother | Learns her grandchild (delivered at publish) |
| 19 | Mathematician | |

### 14.2 Night 1 and later order

| # | Slot | Notes |
|---|---|---|
| 1 | Philosopher | |
| 2 | Sailor | |
| 3 | Poisoner | |
| 4 | Innkeeper | |
| 5 | Gambler | |
| 6 | Devil's Advocate | |
| 7 | Witch | Only while 4 or more players are alive |
| 8 | Mezepheles | Only if a good player said the word |
| 9 | Scarlet Woman | No action of its own (she transforms when the Demon dies) |
| 10 | Imp | |
| 11 | Pukka | |
| 12 | Shabaloth | |
| 13 | Po | |
| 14 | No Dashii | |
| 15 | Vigormortis | |
| 16 | Lil' Monsta | Token holder passes the token and chooses the victim |
| 17 | Assassin | |
| 18 | Godfather | Only if triggered (an Outsider died in the day) |
| 19 | Gossip | Only if the statement was True. No picker. |
| 20 | Professor | |
| 21 | Huntsman | |
| 22 | Moonchild | Only if the Admin recorded a target |
| 23 | Grandmother | Only acts if the grandchild was killed by the Demon tonight |
| 24 | Ravenkeeper | Only if killed tonight (9.4) |
| 25 | Empath | |
| 26 | Fortune Teller | |
| 27 | Flowergirl | |
| 28 | Oracle | |
| 29 | Seamstress | |
| 30 | Juggler | Night 1 only |
| 31 | Balloonist | |
| 32 | Butler | |
| 33 | Mathematician | |

Constraints that must hold: Philosopher, Sailor, Poisoner and Innkeeper before everything they affect; every kill before the Professor, Ravenkeeper and information roles; the Professor before the Empath and Oracle; the Grandmother after every Demon kill; the Mathematician last. The orders are editable data in `shared/src/roles.ts`.

### 14.3 Input summary

| Role | Input | Legal choices |
|---|---|---|
| Philosopher | 1 role, or "Not tonight" | Enabled good roles except the Philosopher, once per game |
| Sailor | 1 player | Any player, self allowed |
| Poisoner | 1 player | Any player, self allowed |
| Innkeeper | 2 players | Two different players, self allowed, Night 1+ |
| Gambler | 1 player and 1 role | Any other player and any enabled role, Night 1+ |
| Devil's Advocate | 1 player | Any player except last night's choice |
| Witch | 1 player | Any player, self allowed; only while 4+ players are alive at the start of the night |
| Imp, Pukka, No Dashii, Vigormortis | 1 player | Any player, self allowed |
| Shabaloth | 2 players | Two different players |
| Po | 0 or 1 player; 3 after choosing no one | See card |
| Lil' Monsta (token holder) | 1 living Minion and 1 player | Pass-to: a living Minion (self = keep). Victim: any player. Night 1+ |
| Assassin | 1 player, or "Not tonight" | Any player, once per game, Night 1+ |
| Godfather | 1 player | Any player, self allowed; only on Night 1+ when triggered |
| Professor | 1 player, or "Not tonight" | Players dead at the start of the night, once per game, Night 1+ |
| Huntsman | 1 player, or "Not tonight" | Any player, once per game, any night |
| Ravenkeeper | 1 player | Any player, second round only |
| Fortune Teller | 2 players | Two different players, self allowed |
| Seamstress | 2 players, or "Not tonight" | Two different players, not the Seamstress, once per game |
| Butler | 1 player | Any player but self |
| All others | none | They see "No night action tonight" |

### 14.4 Townsfolk (24)

#### Clockmaker
- Ability: "You start knowing how many steps from the Demon to its nearest Minion."
- Night 0 only, no input. Result: the smallest number of seats (shorter way around, all seats counted, adjacent = 1) between whoever registers as the Demon and whoever registers as a Minion. A Recluse is a registration source.
- Impaired: a whole number from 1 to half the player count, different from the truth.

#### Sailor
- Ability: "Each night, choose an alive player: either you or they are drunk until dusk. You can't die."
- Every night, 1 player (self allowed). If sober: a `drunk` effect (cause `sailor`, `until_dusk`) on the Sailor or the chosen player. A 50/50 coin (seeded, logged) recommends which; the Admin accepts or picks the other. Choosing self makes the Sailor drunk.
- Passive: while sober, the Sailor cannot die (night and day kills; not the Assassin).
- Impaired: the choice has no effect.

#### Mathematician
- Ability: "Each night, you learn how many players' abilities worked abnormally (since dawn) due to another character's ability."
- Every night, last, no input. Counts the distinct players with an abnormal event tonight: an ability used while impaired by **another** character's effect, a protection or passive (Sailor, Tea Lady, Fool, Mayor, Goon, Grandmother link) that failed because of such impairment, or a Recluse misregistered by the Admin. Not counted: the player's own ability (e.g. a self-drunk Sailor), the Drunk or Marionette's own character, Storyteller-added poison/drunk, a declined action, a Ravenkeeper's second-round pick, and day events. The Admin can add or remove players and override the number.
- Impaired: a number different from the truth, from 0 to N, where N is the number of in-play players other than the Mathematician, the Drunk and the Marionette whose role has a night ability or a tracked passive (Sailor, Tea Lady, Fool, Mayor, Goon, Recluse). The Slayer and Damsel are not counted.

#### Flowergirl
- Ability: "Each night*, you learn if a Demon voted today."
- Night 1+, no input. Result: the Admin's Yes/No for that day (No if not entered). Impaired: the opposite.

#### Gambler
- Ability: "Each night*, choose a player & guess their character: if you guess wrong, you die."
- Night 1+, another player and a role. Compared to the target's **actual** role (a Drunk is "Drunk"). Wrong and sober: `attemptKill(self, self_gamble)` (protections apply, no Mayor bounce). Told nothing either way.
- Impaired: does not die.

#### Philosopher
- Ability: "Once per game, at night, choose a good character: gain that ability. If this character is in play, they are drunk."
- Any night until used: one enabled good role (not the Philosopher), or "Not tonight". Choosing sets the used flag. Once the Philosopher has gained an ability, the choice never appears again (even if the Ability tracker chip is toggled back). If sober: gains the ability **from the next night** (acts at that role's slot with its input; gained passives also work), and every player whose actual role is that role gets a `drunk` effect (cause `philosopher`) that ends when the Philosopher dies or the Admin removes it. Day-only roles: reminder only. Choosing the Grandmother: learns a grandchild the following night.
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
- No picker. The Admin enters None/True/False for the day. On the following night, if True and the Gossip was alive when the night began (even if killed earlier that night) and is sober at the slot, a review item recommends a random alive player other than the Gossip; the Admin approves or picks any alive player; `attemptKill(victim, ability_kill)` (protections and the Mayor bounce apply). The Gossip is told nothing. Impaired: no death.

#### Grandmother
- Ability: "You start knowing a good player & their character. If the Demon kills them, you die too."
- **Night 0:** a review item recommends a random good player other than her (not the Drunk); the Admin may pick any good player. She is told "Your grandchild is X, the Y." (actual character; a Drunk shows as Drunk), and `grandchildId` is recorded.
- Impaired on Night 0: false information (random other player and random enabled role, editable) and **no grandchild** is recorded. A Drunk or Marionette believing they are the Grandmother is always in this case.
- **Link (Night 1+):** if the grandchild died tonight from `demon_attack` (including Mayor redirects, the Pukka's delayed kill and the Lil' Monsta kill) and she is alive and sober, a review item (default yes) runs `attemptKill(grandmother, grandchild_link)`: protections apply, no Mayor bounce. Not triggered by executions, Assassin, Godfather, Gossip, Moonchild, Slayer, Witch or Gambler deaths, or by day deaths. Impaired: she survives and an abnormal event is logged.
- Reviving the grandchild keeps the link; the link ends if she dies. A player who gains the Grandmother later (Huntsman's Damsel: that same night; Philosopher: the following night) learns a grandchild through the same review item.

#### Huntsman
- Ability: "Once per game, at night, choose a living player: the Damsel, if chosen, becomes a not-in-play Townsfolk. [+the Damsel]"
- Any night until used (including Night 0): 1 player or "Not tonight". Requires the Damsel in play at setup. Choosing sets the used flag. If sober and the target's actual role is the Damsel, a review item recommends a random enabled Townsfolk not in play and not anyone's believed role; the Admin may pick another. Her role becomes it (good), she gets "Your role is now X" at publish and acts from the next night. With no Townsfolk left, nothing changes and the Admin sees a warning. Minions are not told.
- The Huntsman is told only "You chose X." Impaired: no change, use spent.

#### Professor
- Ability: "Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected."
- Night 1+ until used: a player dead at the start of the night, or "Not tonight". Choosing sets the used flag. If sober and the target's actual role is a Townsfolk (the Drunk and Marionette are not; an evil-converted Townsfolk is), `revivePlayer`. The revived player is alive for later roles tonight but does not act until the next night.
- Told only "You chose X." Impaired: nothing, use spent.

#### Slayer
- Ability: "Once per game, during the day, publicly choose a player: if they are the Demon, they die."
- Resolved in the Day panel; the Slayer must be alive. Resolving spends the shot (except Cancel). If the Slayer is sober and the target registers as the Demon (the Lil' Monsta token holder does; a sober Recluse uses the "registers as" selector; the red herring does not), the day-kill dialog runs (5.12). Otherwise "nothing happens". A Demon death triggers the Scarlet Woman prompt. The app does not announce a win.

### 14.5 Outsiders (7)

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

### 14.6 Minions (10)

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
- Evil, counts as a Minion, given a believed good role (like the Drunk), always impaired (`own_character`, not counted by the Mathematician). Told nothing as a Minion and not listed to other Minions; the Demon is told who they are. Setup warns if not next to the Demon. Can be chosen in a starpass (then told their real new role).

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

### 14.7 Demons (7)

Common: exactly one Demon at the start. Demon kills are `attemptKill(target, demon_attack)`. Kill roles marked `*` do not act on Night 0. An impaired Demon's kill silently does nothing. A new Demon (starpass, Scarlet Woman) receives Demon information.

#### Imp
- Ability: "Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp."
- Night 1+, any player (self allowed). Starpass (self, sober, and the self-kill succeeds): review item suggesting a living Scarlet Woman, else a random living Minion, listing every living Minion plus "Nobody". The chosen Minion becomes the Imp and gets "You are now the Imp" with Demon information. Impaired: no kill, no starpass.

#### Pukka
- Ability: "Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy."
- Every night, any player. (1) The previous Pukka target, if alive, is attacked (`demon_attack`) and the poison removed, **even if the Pukka is impaired**; (2) if sober, the new target is poisoned (cause `pukka`, `until_source_acts_again`). Night 0 only poisons.

#### Shabaloth
- Ability: "Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated."
- Night 1+, two different players. If sober and any past victim is still dead: a 1-in-3 roll (seeded) recommends a random past victim or nobody; the review item lets the Admin choose any past victim or nobody (shown even when the roll fails). A regurgitated player is revived with `revivePlayer`. Then both targets are attacked; those who die join the list. Impaired: no kills, no regurgitation.

#### Po
- Ability: "Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight."
- Night 1+. Normally: no one or exactly 1 player. After choosing no one: exactly 3 different players (fewer if fewer exist), no "no one" option. If sober, each is attacked. "Last choice was no one" is stored even when impaired.

#### No Dashii
- Ability: "Each night*, choose a player: they die. Your 2 Townsfolk neighbours are poisoned."
- Night 1+, any player. Continuous: while alive and sober, the nearest alive Townsfolk on each side (skipping non-Townsfolk and the dead) are poisoned (cause `no_dashii`), from Night 0 and recomputed live. Impaired: no kill and no poison.

#### Vigormortis
- Ability: "Each night*, choose a player: they die. Minions you kill keep their ability & poison 1 Townsfolk neighbour. [-1 Outsider]"
- Night 1+, any player. If a Minion dies from its attack: `retainsAbilityWhenDead` (they keep acting while dead) and a review item picks one of the nearest alive Townsfolk on each side of that Minion to poison (cause `vigormortis`, while the Vigormortis is alive and sober). Impaired: no kill, no effect.
- **Must not be in the same game as the Scarlet Woman** (7.3).

#### Lil' Monsta
- Ability: "Each night, Minions choose who babysits Lil' Monsta's token & "is the Demon". A player dies each night*. [+1 Minion]"
- Deliberately simplified. The **token holder** registers as the Demon for every ability and their death counts as the Demon dying. After Night 0 no player has a Demon role.
- Setup: +1 Minion; the Admin chooses the Minion role the Lil' Monsta player becomes.
- Night 0: the Lil' Monsta player gets the Demon's information; at publish they become the chosen Minion ("Your role is now X") and hold the token.
- Night 1+: the token holder alone chooses a living Minion to pass the token to (self = keep) and a victim (any player). If sober: the victim is attacked, then the token moves; a new holder is told "You hold Lil' Monsta's token". Impaired: no kill, token stays.
- If the holder dies, the Scarlet Woman check runs; if she takes over she gets the token. Otherwise the token stays with the dead holder; the Admin can move it in Grimoire → Game facts.

---

## 15. Screens summary

| Screen | Audience | Key elements |
|---|---|---|
| Join | Player | Name, preference, admin checkbox; rebind by name |
| Lobby | Player | Names, waiting message, Become Storyteller (if none) |
| Roles / Order / Seats | Player | Enabled roles; role night order; seat order with dead in red (dawn snapshot) |
| My role | Player | Tap-to-reveal card and starting information |
| Night | Player | Countdown, real picker or "No night action" + Continue, games after submitting, Ravenkeeper prompt |
| Day | Player | Dawn banner, own information, "You have died" |
| Admin: Lobby | Admin | Players, presence, rename/remove, QR join |
| Admin: Setup | Admin | Checklist, seating, assignment, decisions, counts, role checklist, briefing |
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
| Night pickers | Include dead players (except Lil' Monsta pass-to and the Professor) |
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
| Mathematician | Impairment by another character and Recluse misregistration only; false values capped |
| Balloonist | Names only |
| Philosopher | Gained ability from next night; drunk effect ends when the Philosopher dies; cannot choose the Philosopher |
| Goon | Any submission that includes the Goon counts, even from an impaired player |
| Mezepheles | First word only; word spent even if impaired |
| Scarlet Woman | Alive count includes the dying Demon; by day she is told at the next night start |
| Mayor | 50/50 recommendation, Admin chooses any outcome; redirects may hit protected players and still go through protections |
| Pukka | Impaired Pukka still kills its previous target but poisons no one new |
| Shabaloth | 1-in-3 regurgitation of any past victim, recommended then Admin chooses |
| Po | None or exactly one; after none, exactly three |
| No Dashii, Vigormortis | Only alive Townsfolk count as neighbours; Vigormortis poison lasts while it is alive and sober |
| Lil' Monsta | Simplified token model; holder passes alone; token stays with a dead holder unless the Scarlet Woman takes it |
| Flowergirl, Juggler | Admin enters the day value |
| Oracle | Dead evil players at its slot; false values 0 to the number dead |
| Gossip | Admin judges; Gossip alive at night start; random victim recommended; protections and Mayor bounce apply |
| Grandmother | Recommended good grandchild (not the Drunk); impaired Night 0 = no grandchild; dies on a Demon-attack death of the grandchild if sober; protections apply |
| Huntsman | Never told whether it worked; converted Damsel acts from next night |
| Professor | Players dead at night start; actual Townsfolk only; revived player acts from next night |
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

122 automated tests (`./dev.sh npm test`), all passing:
- **Original worked examples:** poison makes false info; sober Sailor survives, poisoned Sailor dies; Innkeeper protects but not from the Assassin; Mayor tails redirect (may land on a protected player); Clockmaker 7 seats Demon 1 Minion 5 → 3; Goon; Po none then three; starpass suggests the Scarlet Woman and the Admin picks another; Shabaloth regurgitation; Lil' Monsta flow and the Fortune Teller reading the new holder; reconnect and rebind.
- **Per-role tests** for every role with a night effect (true, impaired, registration cases), setup blocking, role reassignment, Ravenkeeper second round, Scarlet Woman night and day.
- **New-role worked examples:** Oracle (and after a Professor revive), Gossip (True/False/poisoned/killed earlier), Huntsman, Professor (Townsfolk only, not tonight's victims, Shabaloth list cleared), Slayer (kill, poisoned, red herring), Damsel (notices, banner, single guess), Godfather (info, trigger, counts ±1), Witch (curse, 3 alive, poisoned), Huntsman setup guard, Mathematician cap, Grandmother (link, Assassin no link, poisoned no grandchild), identical revives, migration of an old save.
- **Owner changes:** dead players in pickers, Vigormortis + Scarlet Woman, Balloonist names only, story contents (impairment, targets, information received) and Admin-only, Minions knowing each other, dawn snapshot of deaths.
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
- Revived or converted players do not act for the rest of that night (this also applies to the Shabaloth); a Damsel turned Grandmother learns her grandchild that night.
- Day kills use true alignments for the Tea Lady; the Slayer's Recluse choice is a selector in the Day panel.
- Pressing the Witch curse button uses up the curse whatever the dialog choice (except Cancel).
- A dead Damsel being guessed counts as "no effect".
- The Godfather ±1 choice must be made once (suggestions assume +1 until then).

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
