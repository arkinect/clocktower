# Build from the repository root:  docker build -f packages/deploy/Dockerfile -t clocktower:local .
# The old engine is copied into the build stage only, for the parity tests. Those files go at cutover.

# ---- build and test (runs on the build machine's architecture; the output is plain JS) ----
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /app/packages
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY packages/package.json packages/package-lock.json ./
COPY packages/protocol/package.json protocol/
COPY packages/rules/package.json rules/
COPY packages/server/package.json server/
COPY packages/web/package.json web/
RUN npm ci
COPY packages ./
COPY shared ../shared
COPY server/src/engine ../server/src/engine
RUN npm run typecheck && npm run boundaries && npm run build
RUN FUZZ_GAMES=50 npm test

# ---- production dependency (native better-sqlite3, built for the target architecture) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm init -y >/dev/null && npm install --omit=dev better-sqlite3@11.10.0

# ---- run ----
FROM node:22-bookworm-slim
LABEL app=clocktower
LABEL org.opencontainers.image.source=https://github.com/arkinect/clocktower
LABEL org.opencontainers.image.description="Blood on the Clocktower night assistant (unofficial fan tool)"
LABEL org.opencontainers.image.licenses=MIT
ARG BUILD_ID=dev
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data DEFAULT_GAME_CODE=default WEB_DIR=/app/web BUILD_ID=$BUILD_ID
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/server/dist/main.cjs ./main.cjs
COPY --from=build /app/packages/web/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.cjs"]
