#!/bin/sh
# Pulls this stack's images, and restarts it unless the app has seen activity in the last 4 hours.
#   --force   restart without checking
# A saved game from another engine version is archived at startup, and a fresh lobby opens.
# Example cron (Wednesdays 04:30):  30 4 * * 3 /path/to/deploy/update.sh >> /path/to/update.log 2>&1
set -eu
cd "$(dirname "$0")"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) echo "Usage: $0 [--force]" >&2; exit 2 ;;
  esac
done

echo "=== $(date -Is) update"
docker compose pull

if [ "$FORCE" = 0 ]; then
  # From inside the container, as /api/status answers the machine itself only.
  idle=$(docker compose exec -T clocktower node -e "
    fetch('http://127.0.0.1:8080/api/status')
      .then((r) => r.json())
      .then((s) => console.log(Math.floor((Date.now() - s.lastActivity) / 60000)))
      .catch(() => console.log('unknown'));
  " 2>/dev/null || echo unknown)
  case "$idle" in
    unknown | '') echo "The app is not answering: restarting." ;;
    *)
      if [ "$idle" -lt 240 ]; then
        echo "Update deferred: last activity $idle minutes ago. Run $0 --force to restart anyway."
        exit 0
      fi
      ;;
  esac
fi

# Compose touches this project only. Nothing here prunes images, as that would reach other stacks.
docker compose up -d
