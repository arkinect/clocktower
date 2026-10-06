#!/bin/sh
# Pull the latest published images (app and Caddy) and recreate containers whose image changed.
# Game state is on disk, so connected phones just see a few seconds of "Reconnecting…".
# Example cron (Wednesdays 04:30):  30 4 * * 3 /path/to/clocktower/scripts/update.sh >> /path/to/update.log 2>&1
set -eu
cd "$(dirname "$0")/.."
echo "=== $(date -Is) update"
docker compose pull
docker compose up -d
docker image prune -f --filter dangling=true
