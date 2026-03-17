# ──────────────────────────────────────────────────────────────────────────────
# GhostBrain Core — Dockerfile
#
# Build context: repo root (to resolve workspace packages).
# Uses /workspace layout to match monorepo so file:../../packages/... paths resolve.
# ──────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
# /workspace mirrors the monorepo so file:../../packages/ghost-sdk-core resolves correctly
WORKDIR /workspace
COPY packages/ghost-sdk-core/ ./packages/ghost-sdk-core/

WORKDIR /workspace/services/ghostbrain-core
COPY services/ghostbrain-core/package.json services/ghostbrain-core/tsconfig.json ./

# ── Stage 1: install ALL deps (including devDeps for building) ─────────────
FROM base AS builder
# --install-links copies file: deps instead of symlinking so transitive deps hoist correctly
RUN npm install --install-links
COPY services/ghostbrain-core/src ./src
RUN npm run build

# ── Stage 2: pruned production image ─────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /workspace/services/ghostbrain-core

# Non-root user for container security
RUN addgroup -S ghostbrain && adduser -S ghostbrain -G ghostbrain

# Copy built artefacts + package manifest only
COPY --from=builder /workspace/services/ghostbrain-core/package.json ./
COPY --from=builder /workspace/services/ghostbrain-core/dist ./dist
COPY --from=builder /workspace/services/ghostbrain-core/node_modules ./node_modules

# Runtime envs — override in compose/k8s for each deployment target
ENV GHOSTBRAIN_BIND=0.0.0.0
ENV GHOSTBRAIN_PORT=7900
ENV NODE_ENV=production

USER ghostbrain

EXPOSE 7900

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7900/healthz || exit 1

CMD ["node", "dist/index.js"]
