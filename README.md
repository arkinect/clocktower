# Note on security

This project was built almost entirely with AI, and I'm not a web security expert. The repo includes instructions for exposing the app beyond your local network, but I don't recommend it unless you're comfortable securing a self-hosted web app.
It's sped up my nights a lot. I hope others find it useful too.

# Clocktower Night Assistant

A self-hosted web app that runs the **night** of _Blood on the Clocktower_ for an in-person group. Players join from
their own phones; one Storyteller sets up the game, everyone submits their night choices at once, the engine works out
who is drunk or poisoned and what everyone learns, and the Storyteller reviews everything before publishing it at dawn.

> **Unofficial fan project.** Not affiliated with or endorsed by The Pandemonium Institute. _Blood on the Clocktower_,
> its character names and ability texts belong to them and are not covered by this project's licence. See
> [NOTICE.md](NOTICE.md). You need a copy of the game to play.

## What it does

- **55 characters**: the full night logic for each, including drunk/poisoned, registration (Recluse, red herring),
  protections, the Mayor bounce, starpass, Scarlet Woman, revivals, and the Ravenkeeper's second round.
- **Players' phones**: their role (tap to reveal), the script's role list, night order and seating, a night picker
  with only legal choices, private results at dawn. Three idle mini-games unlock once a player has submitted.
- **Storyteller console**: setup checklist (distribution, bluffs, Drunk/Marionette, red herring…), live
  submission board, a review screen where every result can be edited before it's sent, a day panel, a grimoire,
  a circle view of the table, a per-night story of the game and an event log.
- **Robust**: no accounts; players rejoin by tapping their name; all state is saved to SQLite on every change.
- **Safe to expose**: an optional shared password, rate-limited, behind Caddy with automatic HTTPS.

How the code is laid out and why is in [docs/architecture.md](docs/architecture.md). What each character needs is in
[docs/mechanics.md](docs/mechanics.md), and the judgement calls are in [docs/rulings.md](docs/rulings.md).

## Setup

You need a machine with Docker, a domain name pointing at it, and TCP ports 80 and 443 forwarded to it.

```sh
git clone https://github.com/arkinect/clocktower.git && cd clocktower
cp .env.example .env && chmod 600 .env          # set CLOCKTOWER_DOMAIN and CLOCKTOWER_SITE_PASSWORD
mkdir -p caddy/data caddy/config && sudo chown -R 1000:1000 caddy
docker compose up -d
```

Open `https://<your domain>`. The first person to tick **"I am the Storyteller"** becomes the Storyteller, so do that
yourself before sharing the address and password. Caddy fetches and renews the certificate automatically
(`docker logs -f clocktower-caddy`).

The app keeps its games in the `clocktower-data` Docker volume. The server refuses to start exposed without a password.

- **Ports 80/443 already in use?** Change the host side in `docker-compose.yml` (e.g. `"8444:8443"`), forward your
  router's external 443 to it, and enable the port-443-only certificate option in `caddy/Caddyfile`.
- **Stopping:** `docker compose stop`.
- **Starting over:** `docker compose down`, then `docker volume rm clocktower-data`. This erases every saved game.

### On your LAN, with no HTTPS or password

For a game where everyone is on the same Wi-Fi:

```sh
docker run -d --name clocktower -p 8080:8080 -v clocktower-data:/data -e PUBLIC_URL=http://<this machine's IP>:8080 \
  ghcr.io/arkinect/clocktower:latest
```

Players open `http://<this machine's IP>:8080`. Don't expose this to the internet.

### Configuration

Set these in `.env`:

| Variable                   | Default  | Meaning                                                                                                                                                |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLOCKTOWER_DOMAIN`        | required | The public host name players open.                                                                                                                     |
| `CLOCKTOWER_SITE_PASSWORD` | required | Shared password players enter once per device.                                                                                                         |
| `CLOCKTOWER_IMAGE_TAG`     | `latest` | The image version to run.                                                                                                                              |
| `HSTS`                     | `0`      | Set to `1` to send Strict-Transport-Security. It covers the whole host name on every port, so leave it off if any plain-HTTP service shares that name. |

## Updating

`scripts/update.sh` pulls the latest images and restarts the stack, unless the app has seen activity in the last 4
hours. In that case it prints `Update deferred` and exits, and the next run tries again. Only commands count as
activity: a phone reconnecting does not. `--force` restarts without checking.

Run it by hand, or from cron:

```sh
30 4 * * 3 /path/to/clocktower/scripts/update.sh >> /path/to/update.log 2>&1
```

Run `git pull` first if the release changed the compose file, the Caddyfile or the script.

A saved game from another engine version can't be resumed. It is archived at startup and a fresh lobby opens. Each
release says so in its [release notes](https://github.com/arkinect/clocktower/releases) if it does this.

The script touches this stack only, so old images stay until you run `docker image prune`.

## Rolling back

Run an earlier version by its tag, never `:latest`, which is always the newest release. To go back to another 0.5 or
later release, set `CLOCKTOWER_IMAGE_TAG` in `.env` and run `docker compose up -d`.

To go back to 0.4.2, set these in `.env`:

```sh
CLOCKTOWER_IMAGE_TAG=0.4.2
CLOCKTOWER_DATA=./data
CLOCKTOWER_TRUST_PROXY=1
```

Then run `docker compose up -d`. `scripts/update.sh` keeps whatever tag is set. Remove the three lines to go forward
again.

## Security

This is built for a group of friends, not as a public service:

- One shared password gates joining, the player list and rejoining. Wrong guesses from one address wait longer each
  time. Use a long password (five random words is plenty).
- Players already in the game stay logged in with a random token in an HttpOnly cookie.
- The app has no published port, runs as an unprivileged user on a read-only filesystem, and only Caddy can reach it.
- Logs hold player ids and command types, never addresses or tokens.
- Anyone with the password can join, and the first to tick "I am the Storyteller" becomes the Storyteller.
- There is no edge network in front of a home connection, so a large flood can still saturate the line. The limits
  protect the app, not the link.

## Development

Node 22 and npm, or `./dev.sh <command>` to run them in a container.

```sh
npm ci
npm run dev                # server on :8080, Vite with hot reload on :5173
npm test                   # every package
npm run test:e2e -w @ct/web    # browser tests, after npm run build
npm run typecheck
npm run lint
npm run format:check
npm run boundaries         # package boundaries; boundaries:selftest proves they fail on bad code
npm run check:role-ids     # no role id in core code
npm run build
docker build -t clocktower:local .
```

`FUZZ_GAMES` sets how many random games `npm test` plays. It is 500 by default, and 10,000 in the nightly CI run.

| Path                | What                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `packages/protocol` | Schemas for commands, views and socket messages                       |
| `packages/rules`    | The pure game engine. Each character is one file in `src/roles`       |
| `packages/server`   | HTTP and sockets, sessions, password gate, game manager, SQLite store |
| `packages/web`      | Player and Storyteller apps                                           |

To add a character, follow [docs/adding-a-role.md](docs/adding-a-role.md).

To test the built container behind a local Caddy, run these. The site is <http://127.0.0.1:18080> with the password
`load-test`. Passing means a p95 command round trip under 250ms.

```sh
docker compose -f packages/server/test/load/compose.yml up -d --build
LOAD_TARGET=http://127.0.0.1:18080 LOAD_PASSWORD=load-test npm run load -w @ct/server
docker compose -f packages/server/test/load/compose.yml down -v
```

### Releasing

Pushing a tag like `v1.2.3` publishes `ghcr.io/arkinect/clocktower:1.2.3` and `:latest` (amd64 and arm64). A weekly
workflow rebuilds the newest tag on fresh base images, so `:latest` picks up security patches with no new release.

## License

[MIT](LICENSE) for this project's code. Game content belongs to The Pandemonium Institute, see [NOTICE.md](NOTICE.md).
