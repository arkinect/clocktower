# ---- build (runs on the build machine's architecture; output is plain JS) ----
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY client client
RUN npm run build -w client && npm run build -w server && npm test -w server

# ---- production deps (native better-sqlite3, built for the target architecture) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm init -y >/dev/null && npm install --omit=dev better-sqlite3@^11.0.0

# ---- run ----
FROM node:22-bookworm-slim
LABEL app=clocktower
LABEL org.opencontainers.image.source=https://github.com/arkinect/clocktower
LABEL org.opencontainers.image.description="Blood on the Clocktower night assistant (unofficial fan tool)"
LABEL org.opencontainers.image.licenses=MIT
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data DEFAULT_GAME_CODE=default CLIENT_DIR=/app/client
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist/index.js ./server/index.js
COPY --from=build /app/client/dist ./client
RUN mkdir -p /data && chown node:node /data
# docker-compose.yml runs this as uid 1000 (the image's 'node' user); plain `docker run` also works as root.
# Build info shown on the Storyteller's Log page; set by the GitHub workflows.
ARG APP_VERSION=dev
ARG GIT_SHA=
ARG BUILD_DATE=
ENV APP_VERSION=$APP_VERSION GIT_SHA=$GIT_SHA BUILD_DATE=$BUILD_DATE
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
