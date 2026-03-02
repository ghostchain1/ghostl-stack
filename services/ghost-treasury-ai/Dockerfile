FROM node:22.21.0-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# ─── Build stage ──────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false
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

# SECURITY: No secrets in image layers.
# All secrets injected at runtime via environment / Vault.
ENV NODE_ENV=production \
    PORT=7680 \
    LOG_LEVEL=info

EXPOSE 7680

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:7680/health || exit 1

CMD ["node", "dist/index.js"]
