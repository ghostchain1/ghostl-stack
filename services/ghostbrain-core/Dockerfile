FROM node:22.21.0-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile --prod=false
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22.21.0-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY runbooks ./runbooks
COPY schemas ./schemas
COPY configs ./configs

# SECURITY: No secrets in image layers.
# All credentials injected at runtime via Vault / sealed env.
ENV NODE_ENV=production \
    PORT=7900

# Docker socket (read-only, for health ingestion only)
VOLUME ["/var/run/docker.sock"]

EXPOSE 7900

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:7900/healthz || exit 1

USER node
CMD ["node", "dist/index.js"]
