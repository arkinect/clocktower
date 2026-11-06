# Running the rewrite beside the old app

The new app runs as `clocktower-next` on its own hostname, behind the same Caddy, on its own volume. The old app is untouched. Nothing here has been deployed: these are manual steps.

Caddy still terminates HTTPS on forwarded ports 80 and 443, and the site password is required. The server refuses to start exposed without one. There is no edge network in front of the home connection, so a large flood can still saturate the line; the limits protect the app, not the link.

## First time

1. Merge to main. `.github/workflows/next.yml` then builds and pushes `ghcr.io/arkinect/clocktower:next`. Or build it yourself from the repository root:

   ```sh
   docker build -f packages/deploy/Dockerfile -t ghcr.io/arkinect/clocktower:next .
   ```

2. Add a DNS record for the new hostname, pointing at the same address as the existing one.
3. On the server, stop the running stack from the repository root, so the new compose file can take over the same container names:

   ```sh
   docker compose down
   ```

4. Copy `docker-compose.yml`, `Caddyfile`, `update.sh` and `.env.example` from this folder to the directory you will run from. Move the existing `data/` and `caddy/` folders there, or edit the paths in the compose file.
5. `cp .env.example .env`, then fill in all four values.
6. Start it:

   ```sh
   docker compose up -d
   ```

7. Open `https://<new hostname>/healthz`, then the app itself. `docker compose logs clocktower-next` shows player ids and command types only.

## Updating

`./update.sh` pulls the images and restarts, unless the new app has seen activity in the last 4 hours. `./update.sh --force` restarts anyway.

There are no migrations. A saved game from another engine version is archived and a fresh lobby opens, so an update with a new engine version ends any game in progress.

## Bug reports

The Storyteller's Log tab has **Report a problem**, which downloads the command log and engine version. That file replays the game.

## Checks

The load test floods joins and sockets while a scripted game runs, through a real Caddy. From this folder:

```sh
docker compose -f load/compose.yml up -d --build
LOAD_TARGET=http://127.0.0.1:18080 LOAD_PASSWORD=load-test npm run load -w @ct/server
docker compose -f load/compose.yml down -v
```

Passing means a p95 command round trip under 250ms.
