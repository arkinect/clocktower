# Note on security
This project was built almost entirely with AI, and I'm not a web security expert. The repo includes instructions for exposing the app beyond your local network, but I don't recommend it unless you're comfortable securing a self-hosted web app.
It's sped up my nights a lot. I hope others find it useful too.

# Clocktower Night Assistant

A self-hosted web app that runs the **night** of *Blood on the Clocktower* for an in-person group. Players join from
their own phones; one Storyteller sets up the game, everyone submits their night choices at once, the engine works out
who is drunk or poisoned and what everyone learns, and the Storyteller reviews everything before publishing it at dawn.

> **Unofficial fan project.** Not affiliated with or endorsed by The Pandemonium Institute. *Blood on the Clocktower*,
> its character names and ability texts belong to them and are not covered by this project's licence. See
> [NOTICE.md](NOTICE.md). You need a copy of the game to play.

## Features

- **55 characters**: the full night logic for each, including drunk/poisoned, registration (Recluse, red herring),
  protections, the Mayor bounce, starpass, Scarlet Woman, revivals, and the Ravenkeeper's second round.
- **Players' phones**: their role (tap to reveal), the script's role list, night order and seating, a night picker
  with only legal choices, private results at dawn. Two idle mini-games unlock once a player has submitted.
- **Storyteller console**: setup checklist (distribution, bluffs, Drunk/Marionette, red herring…), live
  submission board, a review screen where every result can be edited before it's sent, a day panel, a grimoire,
  a circle view of the table, a per-night story of the game and an event log.
- **Robust**: no accounts; players rejoin by tapping their name; all state is saved to SQLite on every change.
- **Safe to expose**: an optional shared password, rate-limited, behind Caddy with automatic HTTPS.

The full rules and behaviour are specified in [design.md](design.md).

## Run it on the internet (recommended setup)

You need a machine with Docker, a domain name pointing at it, and TCP ports 80 and 443 forwarded to it.

```sh
git clone https://github.com/arkinect/clocktower.git && cd clocktower
cp .env.example .env && chmod 600 .env          # set CLOCKTOWER_DOMAIN and CLOCKTOWER_SITE_PASSWORD
mkdir -p data caddy/data caddy/config && sudo chown -R 1000:1000 data caddy
docker compose up -d
```

Open `https://<your domain>`. The first person to tick **"I am the Storyteller"** becomes the Storyteller, so do that
yourself before sharing the address and password. Caddy fetches and renews the certificate automatically
(`docker logs -f clocktower-caddy`).

- **Ports 80/443 already in use?** Change the host side in `docker-compose.yml` (e.g. `"8444:8443"`), forward your
  router's external 443 to it, and enable the port-443-only certificate option in `caddy/Caddyfile`.
- **Updating:** `./scripts/update.sh` (or run it from cron). See [Updating](#updating) below.
- **Stopping:** `docker compose stop`. **Starting over:** the Storyteller's *New game (erase)* button, or stop and
  delete `data/clocktower.db*`.

## Updating

`./scripts/update.sh` pulls the latest images and restarts what changed. Run it by hand, or from cron:

```sh
30 4 * * 3 /path/to/clocktower/scripts/update.sh >> /path/to/update.log 2>&1
```

It never restarts the app in the middle of a game:

| Game state when the update runs | What happens |
|---|---|
| Ended | Restarts. |
| Lobby nobody has joined | Restarts. A saved-game schema change deletes it rather than ending it; the default game is recreated. |
| Any other phase, progress in the last 4 hours | **Deferred**: prints `Update deferred: game in progress` and exits. The next run tries again. |
| Any other phase, no progress for 4 hours | Treated as abandoned. Restarts, and the game is ended. |

"Progress" is anything except players reconnecting; a player joining counts. A new image that keeps the saved-game schema (for
example a weekly security rebuild) restarts straight away even mid-game, since nothing is lost. `--force` restarts
without checking.

**Releases that change the saved-game schema** are marked in their release notes. On the first start of such a
release the server copies the database to `data/clocktower.db.pre-v<N>`, then ends any game still in progress
(players and the Storyteller see "This game was ended by an app update.") and upgrades every saved game. The
Storyteller's *Play again* starts a new game with the same players. Phones still running the old page show "The app
was updated. Tap to reload." The server log has one line per upgrade, e.g.
`Upgraded 1 game to schema v7 (1 ended: update). Backup: clocktower.db.pre-v7.`

If the server refuses to start, `docker logs clocktower` says why (`Not starting: …`).

**Rolling back** after a schema change: `docker compose stop clocktower`, copy `data/clocktower.db.pre-v<N>` over
`data/clocktower.db` (and delete `data/clocktower.db-wal` and `data/clocktower.db-shm`), then run the older image
(set its version tag in `docker-compose.yml`) and `docker compose up -d`.

**Updating from v0.3.0 or earlier:** those servers can't report whether a game is in progress, so the new
`update.sh` defers until you run it once by hand with `--force`, at a time no game is running. The game-in-progress
check lives in `scripts/update.sh`, so you get it by updating your checkout of this repository (`git pull`); the
startup upgrade ships in the image.

## Run it on your LAN (no HTTPS, no password)

For a game where everyone is on the same Wi-Fi:

```sh
docker run -d --name clocktower -p 8080:8080 -v "$PWD/data:/data" ghcr.io/arkinect/clocktower:latest
```

Players open `http://<this machine's IP>:8080`. Set `-e PUBLIC_URL=http://<ip>:8080` so the join QR code shows the
right address. Don't expose this to the internet without the password and HTTPS setup above.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SITE_PASSWORD` | *(none)* | Shared password players enter once per device. Empty = no password. |
| `PUBLIC_URL` | browser origin | Address shown in the Storyteller's join QR code. |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy, so client IPs (for the lockout) and HTTPS are detected. |
| `PORT` | `8080` | Port the app listens on inside the container. |
| `DATA_DIR` | `/data` | Where the SQLite database lives. |

With `docker compose`, set `CLOCKTOWER_DOMAIN` and `CLOCKTOWER_SITE_PASSWORD` in `.env`; the compose file maps them.

## Security

This is built for a group of friends, not as a public service:

- One shared password gates joining, the player list and "Rejoin". Ten wrong guesses from one
  address lock it out for 15 minutes. Use a long password (five random words is plenty).
- Players already in the game stay logged in with a random token stored on their device.
- In the compose setup the app has no published port, runs as an unprivileged user on a read-only filesystem, and
  only Caddy can reach it.
- Anyone with the password can join, and the first to tick "I am the Storyteller" becomes the Storyteller.

## Development

Node 22 and npm (or `./dev.sh <command>` to run them in a container):

```sh
npm install
npm test               # engine unit tests + randomised multi-night games (vitest)
npm run typecheck
npm run build          # client (Vite) + server (esbuild)
npm run dev:server     # API on :8080 (tsx watch)
npm run dev:client     # Vite dev server, proxies /api and /ws to :8080
```

`scripts/smoke.mjs` is an end-to-end test against a running server without a password (it resets the game).

| Path | What |
|---|---|
| `shared/src/roles.ts` | Role data (ability text, types, modifiers) and both night orders |
| `shared/src/state.ts`, `types.ts`, `protocol.ts` | Game state, views and intents shared by server and client |
| `server/src/engine/game.ts` | The reducer: `(GameState, actor, Intent) → (GameState, events)` |
| `server/src/engine/night.ts` | Night resolution: night walk, kill pipeline, registration, review items |
| `server/src/engine/roles/index.ts` | One behaviour per role (input spec + resolve) |
| `server/src/engine/impairment.ts` | The only place that decides drunk/poisoned |
| `server/src/engine/views.ts` | The hidden-information boundary (player view vs Storyteller view) |
| `server/src/index.ts`, `manager.ts`, `db.ts` | Fastify + WebSocket server, game manager, SQLite store |
| `client/src/player/*`, `client/src/admin/*` | Player screens and mini-games; Storyteller console |

Pushes to `main` publish `ghcr.io/arkinect/clocktower:edge`; tags like `v1.0.0` publish `:1.0.0` and `:latest`
(amd64 and arm64). A weekly workflow rebuilds the newest release on fresh base images so `:latest` picks up
security patches without a new release.

## License

[MIT](LICENSE) for this project's code. Game content belongs to The Pandemonium Institute, see [NOTICE.md](NOTICE.md).
