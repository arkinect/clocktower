#!/bin/sh
# Pull the latest published images (app and Caddy) and recreate containers whose image changed.
# Game state is on disk, so connected phones just see a few seconds of "Reconnecting…".
# The app is never restarted in the middle of a game (design.md section 5.5): if any game has not ENDED and has made
# progress in the last 4 hours, the update is deferred and the next run tries again. An image that keeps the
# saved-game schema restarts straight away, since a restart then loses nothing.
#   --force   restart without checking (a game in progress is ended at startup if the saved-game schema changed)
# Example cron (Wednesdays 04:30):  30 4 * * 3 /path/to/clocktower/scripts/update.sh >> /path/to/update.log 2>&1
set -eu
cd "$(dirname "$0")/.."

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) echo "Usage: $0 [--force]" >&2; exit 2 ;;
  esac
done

restart() {
  docker compose up -d
  docker image prune -f --filter dangling=true
}

echo "=== $(date -Is) update"
docker compose pull

# Compare the running app container with the image now on disk, not the image before this pull: an update deferred
# by an earlier run has already been pulled.
container=$(docker compose ps -q clocktower 2>/dev/null || true)
if [ -z "$container" ]; then
  echo "App not running: starting."
  restart
  exit 0
fi
image_name=$(docker inspect -f '{{.Config.Image}}' "$container")
running_image=$(docker inspect -f '{{.Image}}' "$container")
latest_image=$(docker image inspect -f '{{.Id}}' "$image_name")
if [ "$running_image" = "$latest_image" ]; then
  echo "App image unchanged."
  restart  # still applies a new Caddy image; leaves the app running
  exit 0
fi

if [ "$FORCE" = 1 ]; then
  echo "--force: restarting without checking for a game in progress."
  restart
  exit 0
fi

# Ask the running server from inside its container, as the Dockerfile HEALTHCHECK does. Output lines:
#   schema <version> safe|busy
#   game <code> <phase> <last progress>   (one per game in progress)
status=$(docker compose exec -T clocktower node -e "
fetch('http://127.0.0.1:8080/api/upgrade-status')
  .then((r) => (r.ok ? r.json() : null))
  .then((s) => {
    if (!s) { console.log('missing'); return; }
    console.log('schema ' + s.schemaVersion + ' ' + (s.safeToRestart ? 'safe' : 'busy'));
    for (const g of s.games) if (g.phase !== 'ENDED' && !g.abandoned)
      console.log('game ' + g.code + ' ' + g.phase + ' ' + new Date(g.lastProgressAt).toISOString());
  })
  .catch(() => console.log('missing'))" 2>/dev/null || echo missing)

first=$(echo "$status" | head -n 1)
if [ "${first%% *}" != schema ]; then
  echo "Warning: the running server can't report whether a game is in progress (it predates /api/upgrade-status)."
  echo "Update deferred. Run $0 --force at a time no game is running."
  exit 0
fi
running_schema=$(echo "$first" | cut -d' ' -f2)
safe=$(echo "$first" | cut -d' ' -f3)

new_schema=$(docker image inspect -f '{{ index .Config.Labels "clocktower.schema" }}' "$latest_image" 2>/dev/null || true)
if [ -n "$new_schema" ] && [ "$new_schema" = "$running_schema" ]; then
  echo "Saved-game schema unchanged (v$running_schema): restarting."
  restart
  exit 0
fi

if [ "$safe" = safe ]; then
  echo "No game in progress: restarting."
  restart
  exit 0
fi

echo "$status" | grep '^game ' | while read -r _ code phase at; do
  echo "Update deferred: game in progress (game $code, $phase, last progress $at)."
done
exit 0
