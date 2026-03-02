FROM node:22.21.0-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22.21.0-slim AS runtime
WORKDIR /app

# Install Foundry (for forge invocation inside pipelines) and Slither
# Foundry is installed from the official installer; Slither via pip.
# Both are optional — pipelines fall back to stub mode if unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl git python3 python3-pip ca-certificates \
    && pip3 install --no-cache-dir slither-analyzer --break-system-packages 2>/dev/null || true \
    && curl -L https://foundry.paradigm.xyz | bash || true \
    && export PATH="$HOME/.foundry/bin:$PATH" \
    && foundryup --version stable 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.foundry/bin:$PATH"

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

# Mount point for contracts repo (bind-mounted in compose)
VOLUME ["/app/contracts"]

# SECURITY: No secrets in image layers.
# Keys are injected at runtime via Vault or sealed env.
ENV NODE_ENV=production \
    PORT=7610 \
    GHOSTAI_DRY_RUN=true

EXPOSE 7610

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:7610/health || exit 1

USER node
CMD ["node", "dist/index.js"]
