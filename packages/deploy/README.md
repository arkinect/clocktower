# Deploying Clocktower

The rewrite replaces the old app. `docker-compose.yml` here runs the new app and Caddy on the existing hostname, and nothing else. There is no second service and no second domain. Nothing here has been deployed: these are manual steps.

Caddy still terminates HTTPS on forwarded ports 80 and 443, and the site password is required. The server refuses to start exposed without one. There is no edge network in front of the home connection, so a large flood can still saturate the line; the limits protect the app, not the link.

## 1. Test locally

From this folder, build the container and put it behind a local Caddy:

```sh
docker compose -f load/compose.yml up -d --build
```

Open <http://127.0.0.1:18080>. The site password is `load-test`. Play a game through at least one night, on a phone if you can.

Then flood it while a scripted game runs. Passing means a p95 command round trip under 250ms:

```sh
LOAD_TARGET=http://127.0.0.1:18080 LOAD_PASSWORD=load-test npm run load -w @ct/server
docker compose -f load/compose.yml down -v
```

## 2. Cut over

Do this when no game is on. Players keep the same address.

1. Merge to main. `.github/workflows/next.yml` then builds and pushes `ghcr.io/arkinect/clocktower:next`, and the same image as `:sha-<commit>`.
2. On the server, stop the old stack from the repository root. The new stack takes over its container names and ports:

   ```sh
   docker compose down
   ```

3. Copy `docker-compose.yml`, `Caddyfile`, `update.sh` and `.env.example` from this folder to the directory you will run from. Move the existing `caddy/` folder there so the certificates carry over.
4. `cp .env.example .env`, then fill in the same hostname and site password as the old `.env`.
5. Start it:

   ```sh
   docker compose up -d
   ```

6. Open `https://<hostname>/healthz`, then the app. `docker compose logs clocktower` shows player ids and command types only.

The new app keeps its games in the `clocktower-data` volume. Leave the old `data/` folder where it is: games do not carry across, and it is what a rollback to the old app reads. The two must never share a folder, because both use a file called `clocktower.db` with different tables.

## Rolling back

Run the previous image tag. `:sha-<commit>` tags stay in the registry; the old app's are its release tags, such as `:latest`.

To an earlier build of the new app, set the tag in `.env` and restart:

```sh
CLOCKTOWER_IMAGE_TAG=sha-<commit>
```

```sh
docker compose up -d
```

If that build has a different engine version, the game in progress is archived and a fresh lobby opens.

To the old app, also point it at its own data and its own proxy setting, in the same `.env`:

```sh
CLOCKTOWER_IMAGE_TAG=latest
CLOCKTOWER_DATA=./data
CLOCKTOWER_TRUST_PROXY=1
```

`update.sh` keeps whatever tag is set. Remove the lines to go forward again.

## Updating

`./update.sh` pulls this stack's images and restarts it, unless `/api/status` shows activity in the last 4 hours. `./update.sh --force` restarts anyway. It touches nothing outside this stack, so old images stay until you run `docker image prune`.

There are no migrations. A saved game from another engine version is archived and a fresh lobby opens, so an update with a new engine version ends any game in progress.

## Bug reports

The Storyteller's Log tab has **Report a problem**, which downloads the command log and engine version. That file replays the game.
