#!/bin/sh
# Run a command inside a Node 22 container, so the native better-sqlite3 build is the same on every OS.
# Usage: ./dev.sh npm ci   |   DEV_PORTS="-p 5173:5173 -p 8080:8080" ./dev.sh npm run dev
exec docker run --rm -it -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \n  -v "$(cd "$(dirname "$0")" && pwd)":/app -w /app ${DEV_PORTS:-} node:22-bookworm-slim "$@"
