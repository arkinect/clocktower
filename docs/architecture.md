# Architecture

Condensed from the rewrite plan (`docs/rewrite/PLAN.md`).

Four packages with one-way dependencies, all under `packages/` with their own npm root:

| Package        | Holds                                                                  | Depends on                      |
| -------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `@ct/protocol` | Zod schemas for commands, views and socket messages; branded id types  | zod                             |
| `@ct/rules`    | Game model, phases, commands, ability framework, night, roles, jinxes  | protocol, immer, zod            |
| `@ct/server`   | HTTP and sockets, sessions, password gate, game manager, SQLite store  | rules, protocol, fastify, ws    |
| `@ct/web`      | Player and Storyteller apps                                            | protocol, react                 |

Principles:

1. The rules engine is pure: no I/O, no clock, no `Math.random`. Time and seeds arrive with each command.
2. The core dispatches to hooks on ability instances. A role id in core code fails CI.
3. State is typed all the way down.
4. Derived facts (impairment, registration, alive sets) are computed once per pass and passed down.
5. Rulings live next to the role that needs them, with a test named after the ruling.

The boundaries are enforced by tooling: dependency-cruiser (`npm run boundaries`) and ESLint. `npm run
boundaries:selftest` writes deliberately bad files and proves the checks reject them.
