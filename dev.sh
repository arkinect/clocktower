#!/bin/sh
# Optional: run a command inside a Node 22 container, so you do not need Node installed locally.
# Usage: ./dev.sh npm install   |   ./dev.sh npm test
exec docker run --rm -i -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm -e npm_config_update_notifier=false \
  -v "$(cd "$(dirname "$0")" && pwd)":/app -w /app ${DEV_PORTS:-} node:22-bookworm-slim "$@"
