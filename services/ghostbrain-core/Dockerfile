# ──────────────────────────────────────────────────────────────────────────────
# GhostBrain Core — Dockerfile
#
# Multi-stage build: deps → dev build → pruned production image
# ──────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
WORKDIR /app
COPY package.json tsconfig.json ./

# ── Stage 1: install ALL deps (including devDeps for building) ─────────────
FROM base AS builder
RUN npm install
COPY src ./src
RUN npm run build

# ── Stage 2: pruned production image ─────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Copy built artefacts + package manifest only
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist

# Install production-only node_modules
RUN npm install --omit=dev

# Runtime envs — override in compose/k8s for each deployment target
ENV GHOSTBRAIN_BIND=0.0.0.0
ENV GHOSTBRAIN_PORT=7900
ENV NODE_ENV=production

# Non-root user for container security
RUN addgroup -S ghostbrain && adduser -S ghostbrain -G ghostbrain
USER ghostbrain

EXPOSE 7900

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7900/healthz || exit 1

CMD ["node", "dist/index.js"]
