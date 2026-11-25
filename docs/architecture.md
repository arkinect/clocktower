# Architecture

Four packages with one-way dependencies, under `packages/`, in one npm workspace at the repository root:

| Package        | Holds                                                                 | Depends on                   |
| -------------- | --------------------------------------------------------------------- | ---------------------------- |
| `@ct/protocol` | Zod schemas for commands, views and socket messages; branded id types | zod                          |
| `@ct/rules`    | Game model, phases, commands, ability framework, night, roles, jinxes | protocol, immer, zod         |
| `@ct/server`   | HTTP and sockets, sessions, password gate, game manager, SQLite store | rules, protocol, fastify, ws |
| `@ct/web`      | Player, Storyteller and steward apps                                  | protocol, react              |

Principles:

1. The rules engine is pure: no I/O, no clock, no `Math.random`. Time and seeds arrive with each command.
2. The core dispatches to hooks on ability instances. A role id in core code fails CI.
3. State is typed all the way down.
4. Derived facts (impairment, registration, alive sets) are computed once per pass and passed down.
5. Rulings live next to the role that needs them, with a test named after the ruling.

The boundaries are enforced by tooling: dependency-cruiser (`npm run boundaries`) and ESLint. `npm run
boundaries:selftest` writes deliberately bad files and proves the checks reject them.

## Decisions worth knowing

Rules:

- Commands are grouped per phase in `rules/src/phases/<phase>.ts`, one `defineCommand` each. The phase guard is declared, never hand-written.
- `ctx.require` is a plain function, `need()`, because TypeScript assertion signatures cannot be called through a contextually typed parameter.
- The Resolution is never stored in state. It is memoised against the state object, and commands that cannot change it carry the memo forward.
- `@ct/rules` depends on zod directly, for the GameState schema. `rules/test/core/schema.test.ts` hashes that schema against `ENGINE_VERSION`.
- The tables of the game state (players, abilities and so on) are Maps, so looking up an id finds only what was put there. A plain object also finds the names every object inherits, such as `constructor`. Views stay plain JSON.
- `JSON.stringify` drops a Map without a word, so only `saveState` and `loadState` turn state into text and back. `clone` is written by hand, as it must also copy immer drafts, which `structuredClone` refuses.
- Ids have an exact format, checked as they arrive: 16 hex digits for a player, `a1` for an ability, `c1` for a condition. A `RoleId` or `GameId` has none, so those only refuse the inherited names.
- Night positions are relative, with gaps. They are not the official sheet's numbers.
- In autoplay `storytellerId` is null and `stewardId` is set, so every Storyteller command is refused and nobody is sent a Storyteller's view. The steward's commands are their own list (`by: 'steward'`), and none takes a `force`.
- `StewardView` is built up from public facts and the steward's own player view. It is never a Storyteller's view with fields taken out, as a field added later would leak. `state.autoplay` holds the public record, as `events` mixes public and hidden ones.
- A steward's command must not fail, or word its refusal, by anything hidden. Dawn says the same thing for the first 30 seconds whatever the night is doing.

Server:

- The app's database lives in the `clocktower-data` volume, never `./data`. The 0.4.2 database there has the same file name and different tables, so sharing the folder would stop the app starting.
- `TRUST_PROXY` is a list of addresses or host names, resolved at boot and every minute, because the peer is compared with the configured Caddy address.
- `GET /api/g/:code/names` reads the site password from an `X-Site-Password` header, as a query string would put it in logs and history.
- `GET /api/g/:code/session` lets a phone learn who its HttpOnly cookie makes it.
- A request with no password at all gets a 401 without starting the backoff, so a phone can find out it needs one.
- A game with no sockets and six idle hours gives up its slot when a fifth game wants one. Otherwise abandoned codes would hold all four slots until a restart.
- The welcome message carries the jinx list, for the Roles tab. Jinxes are not in the view.
- A command's new state is kept only once every player's view of it has been built and it has been saved. Otherwise the old state stays and the sender is told something went wrong, so a state that cannot be shown is never stored.
- A view that cannot be built or sent closes that one socket. Nothing may throw out of a socket callback or a timer, as Node exits on it. There is no `uncaughtException` handler that carries on: past that point the process is in an unknown state, so it exits and Compose restarts it.
- An error in the rules is logged with the player id and command type. The sender sees only "Something went wrong."
- Server messages past the socket rate limit are dropped with no ack, as the limit is there to shed work. The client treats a missing ack as a timeout.
- The idle card game (`server/src/cards`) is not part of the game: its moves are socket messages, not commands, so nothing is stored, logged or counted against the command limit, and a restart deals new hands. The rules engine has no clock, and the tables need one.
- At the card tables a hand belongs to its player, not to a seat. A player who leaves takes it with them and brings it back to the fullest table with room, so players share as few tables as possible; a bot with its own hand fills every other seat, and an empty table closes. No seat is sent with a name, and a phone is sent no hand but its own.
- Per-request logging is off, so addresses and URLs stay out of the logs. Each command logs the player id and command type.
- `@fastify/static` is imported only when there is a client directory. Its dependencies are ES modules that `require` cannot load on some Node 22 releases. The esbuild bundle is unaffected.
- In autoplay the server takes the steps nobody should take by hand. After every command, at startup, and when a time is reached, it asks the rules for the next one (`autopilotStep`) and sends it as a system command, through the same queue and log. A night that throws is reported to the steward as stuck, never why.
- The export of an autoplay game is refused to everyone until it has ended, as it replays the whole game.

Web:

- The steward's console (`web/src/steward`) shares parts with the other two. Announcements are on the Day tab, and the steward's own character and results on My role only, covered, so they are never read out by mistake. What their character asks of them is on Actions.
- Player phones follow the phone's setting. The Storyteller console is always dark, as it was before 0.5.0.
- Game-end suggestions are computed by the rules but hidden in the console (`SHOW_GAME_END_CARDS`) until a later release.
- The idle games keep one plain stylesheet, `games/games.css`, which loads only with their chunk.
- The Log tab and its Report a problem button read the export endpoint, because the view does not carry the command log. Everything else in the console reads the view.
