# ──────────────────────────────────────────────────────────────────────────────
# Hyper Ghost AI — Dockerfile
#
# Autonomous self-healing supervisor for GhostChain infrastructure.
# Hardened: brain-token gate requires x-brain-token matching HYPER_GHOST_BRAIN_TOKEN.
# Port: 7741  (bind: 0.0.0.0 inside container, mapped via compose)
# ──────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS production
WORKDIR /app

# Non-root user
RUN addgroup -S hyperai && adduser -S hyperai -G hyperai

COPY package.json ./
# Zero production dependencies — no npm install step needed
COPY src ./src

# Runtime defaults (all configurable via compose env_file / environment:)
ENV NODE_ENV=production
ENV HYPER_GHOST_BIND=0.0.0.0
ENV HYPER_GHOST_PORT=7741
ENV HYPER_GHOST_REQUIRE_BRAIN_TOKEN=1

USER hyperai

EXPOSE 7741

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7741/healthz || exit 1

CMD ["node", "src/index.js"]
