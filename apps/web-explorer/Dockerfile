# syntax=docker/dockerfile:1
# ──────────────────────────────────────────────────────────
# Stage 1: dependency resolution
# ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /repo

# Copy workspace root manifests
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./

# Copy package manifests for the workspace (avoids full source copy)
COPY packages/ui/package.json ./packages/ui/
COPY apps/web-explorer/package.json ./apps/web-explorer/

RUN npm ci --ignore-scripts --legacy-peer-deps

# ──────────────────────────────────────────────────────────
# Stage 2: build
# ──────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /repo

# Copy full source
COPY packages/ ./packages/
COPY apps/web-explorer/ ./apps/web-explorer/

# Build only the target app
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p apps/web-explorer/public
RUN NEXT_IGNORE_INCORRECT_LOCKFILE=1 NEXT_DISABLE_ESLINT=1 npm run build --workspace=apps/web-explorer --ignore-scripts

# ──────────────────────────────────────────────────────────
# Stage 3: minimal runtime image
# ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3014 \
    HOSTNAME=0.0.0.0

# Standalone output bundles everything needed
COPY --from=builder /repo/apps/web-explorer/.next/standalone ./
COPY --from=builder /repo/apps/web-explorer/.next/static ./apps/web-explorer/.next/static
RUN mkdir -p ./apps/web-explorer/public

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3014
CMD ["node", "apps/web-explorer/server.js"]
