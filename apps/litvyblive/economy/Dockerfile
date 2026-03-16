# ── LitVybzLive Economy Microservices — Shared Dockerfile ────────────────────
#
# Build arg (required):
#   SERVICE = creator-treasury | fan-memberships | creator-tokens |
#             nft-gifts | staking-engine | revenue-distribution |
#             fan-dao | marketplace
#
# Build context: apps/litvyblive/economy/
#
# Example:
#   docker build --build-arg SERVICE=creator-treasury -t litvyb-creator-treasury .

ARG NODE_VER=22-alpine

# ── Stage 1: install all deps (prod + dev) for compilation ───────────────────
FROM node:${NODE_VER} AS deps
WORKDIR /app

# Root economy-level deps (prod + dev includes typescript, tsx)
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: compile the selected service ────────────────────────────────────
FROM deps AS builder
ARG SERVICE

# Copy the service source into its expected relative location
COPY ${SERVICE}/tsconfig.json ./${SERVICE}/tsconfig.json
COPY ${SERVICE}/src            ./${SERVICE}/src

# Compile using typescript from root node_modules
RUN cd "${SERVICE}" && ../node_modules/.bin/tsc

# ── Stage 3: production runtime image ────────────────────────────────────────
FROM node:${NODE_VER} AS runner

ARG SERVICE
ENV NODE_ENV=production \
    SERVICE_NAME=${SERVICE}

WORKDIR /app

# Unprivileged user
RUN addgroup -S litvyb && adduser -S -G litvyb litvyb

# Install only production dependencies from root (all services share these)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JS from builder
COPY --from=builder /app/${SERVICE}/dist ./dist

# Security hardening
USER litvyb

# Port is overridden per-service via environment variable
EXPOSE 7040

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-7040}/health || exit 1

CMD ["node", "dist/index.js"]
