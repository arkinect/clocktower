# Architecture

Four packages with one-way dependencies, under `packages/`, in one npm workspace at the repository root:

| Package        | Holds                                                                 | Depends on                   |
| -------------- | --------------------------------------------------------------------- | ---------------------------- |
| `@ct/protocol` | Zod schemas for commands, views and socket messages; branded id types | zod                          |
| `@ct/rules`    | Game model, phases, commands, ability framework, night, roles, jinxes | protocol, immer, zod         |
| `@ct/server`   | HTTP and sockets, sessions, password gate, game manager, SQLite store | rules, protocol, fastify, ws |
| `@ct/web`      | Player and Storyteller apps                                           | protocol, react              |

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
- Night positions are relative, with gaps. They are not the official sheet's numbers.

Server:

- The app's database lives in the `clocktower-data` volume, never `./data`. The 0.4.2 database there has the same file name and different tables, so sharing the folder would stop the app starting.
- `TRUST_PROXY` is a list of addresses or host names, resolved at boot and every minute, because the peer is compared with the configured Caddy address.
- `GET /api/g/:code/names` reads the site password from an `X-Site-Password` header, as a query string would put it in logs and history.
- `GET /api/g/:code/session` lets a phone learn who its HttpOnly cookie makes it.
- A request with no password at all gets a 401 without starting the backoff, so a phone can find out it needs one.
- A game with no sockets and six idle hours gives up its slot when a fifth game wants one. Otherwise abandoned codes would hold all four slots until a restart.
- The welcome message carries the jinx list, for the Roles tab. Jinxes are not in the view.
- Server messages past the socket rate limit are dropped with no ack, as the limit is there to shed work. The client treats a missing ack as a timeout.
- Per-request logging is off, so addresses and URLs stay out of the logs. Each command logs the player id and command type.
- `@fastify/static` is imported only when there is a client directory. Its dependencies are ES modules that `require` cannot load on some Node 22 releases. The esbuild bundle is unaffected.

Web:

- The theme follows the phone's setting. There is no in-app switch.
- The idle games keep one plain stylesheet, `games/games.css`, which loads only with their chunk.
- The Log tab and its Report a problem button read the export endpoint, because the view does not carry the command log. Everything else in the console reads the view.
