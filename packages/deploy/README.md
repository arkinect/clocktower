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

First, on GitHub, in one pull request to main, change the workflows. `next.yml` will not publish a release until this is merged, and the old ones would overwrite the new `:latest`:

| Workflow      | At cutover               | Why                                                                                                           |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `release.yml` | Delete                   | Builds the old app from the root `Dockerfile` and publishes `:edge`, `:<version>` and `:latest` on every tag. |
| `refresh.yml` | Delete                   | Rebuilds the newest tag from the root `Dockerfile` every Tuesday and publishes it as `:latest`.               |
| `ci.yml`      | Delete with the old code | Runs the old app's tests. It can stay until then.                                                             |
| `next.yml`    | Keep                     | Publishes the new app.                                                                                        |
| `rewrite.yml` | Keep                     | Tests the new app.                                                                                            |

Then:

1. Tag the first release, above the old app's last tag, `v0.4.2`, so that the weekly rebuild picks it. For example `v0.5.0`. `next.yml` publishes `:0.5.0` and `:latest`. Wait for it to finish: until then `:latest` is still the old app.
2. On the server, replace the cron line that runs the old update script. The old `scripts/update.sh` drives the old compose file, which has the same container names, so leaving it would bring the old stack back:

   ```sh
   # Remove:
   30 4 * * 3 /path/to/clocktower/scripts/update.sh >> /path/to/update.log 2>&1
   # Add:
   30 4 * * 3 /path/to/deploy/update.sh >> /path/to/update.log 2>&1
   ```

3. Stop the old stack from the repository root. The new stack takes over its container names and ports:

   ```sh
   docker compose down
   ```

4. Copy `docker-compose.yml`, `update.sh` and `.env.example` from this folder to the directory you will run from, which is the folder the cron line names. Move the existing `caddy/` folder there so the certificates carry over.
5. Bring in `Caddyfile` without overwriting what the server has. Merge any extra site blocks or options from the server's existing Caddyfile into this one, such as other sites on the same Caddy, or the `tls` block for a server that cannot forward port 80.
6. `cp .env.example .env`, then fill in the same hostname and site password as the old `.env`.
7. Start it:

   ```sh
   docker compose up -d
   ```

8. Open `https://<hostname>/healthz`, then the app. `docker compose logs clocktower` shows player ids and command types only.

The new app keeps its games in the `clocktower-data` volume. Leave the old `data/` folder where it is: games do not carry across, and it is what a rollback to the old app reads. The two must never share a folder, because both use a file called `clocktower.db` with different tables.

## HSTS

The server does not send Strict-Transport-Security, because it applies to the whole host name on every port and would break any plain-HTTP service sharing it. To send it, set `HSTS=1` in `.env`.

## Rolling back

Run the previous image tag, never `:latest`, which is always the newest release. Each new release stays as `:<version>`, and each push to main as `:sha-<commit>`.

To an earlier build of the new app, set the tag in `.env` and restart:

```sh
CLOCKTOWER_IMAGE_TAG=0.5.0
```

```sh
docker compose up -d
```

If that build has a different engine version, the game in progress is archived and a fresh lobby opens.

To the old app, whose last release is `v0.4.2`, also point it at its own data and its own proxy setting, in the same `.env`:

```sh
CLOCKTOWER_IMAGE_TAG=0.4.2
CLOCKTOWER_DATA=./data
CLOCKTOWER_TRUST_PROXY=1
```

`update.sh` keeps whatever tag is set. Remove the lines to go forward again.

## Updating

`./update.sh` pulls this stack's images and restarts it, unless `/api/status` shows activity in the last 4 hours. `./update.sh --force` restarts anyway. It touches nothing outside this stack, so old images stay until you run `docker image prune`.

There are no migrations. A saved game from another engine version is archived and a fresh lobby opens, so an update with a new engine version ends any game in progress.

## Bug reports

The Storyteller's Log tab has **Report a problem**, which downloads the command log and engine version. That file replays the game.
