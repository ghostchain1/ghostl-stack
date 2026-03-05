# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS base
LABEL org.opencontainers.image.source="https://github.com/ghostchain1/ghostl-stack"
LABEL ghostbrain.role="gsa"
LABEL ghostbrain.layer="L2"
LABEL ghostbrain.routing-law="L3→L2→L1"

WORKDIR /app

# Non-root user
RUN addgroup -g 10001 ghost && adduser -u 10001 -G ghost -s /bin/sh -D ghost

# ── Copy source (no production npm deps for this service) ──────────────────────
COPY package.json ./
COPY src/ ./src/

# ── Remove npm and yarn from the runtime image ─────────────────────────────────
# All HIGH CVEs (CVE-2025-64756, CVE-2026-26996, CVE-2026-27903, CVE-2026-27904,
# CVE-2026-23745, CVE-2026-23950, CVE-2026-24842, CVE-2026-26960) are in npm's
# bundled glob/minimatch/tar packages and yarn. This service has zero production
# npm dependencies so neither tool is needed at runtime.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /opt/yarn* \
      /root/.npm \
      /tmp/npm*

# ── Runtime env defaults (all overridable via docker-compose) ──────────────────
ENV NODE_ENV=production \
    GSA_PORT=7850 \
    GSA_BIND=0.0.0.0 \
    GSA_APPLY_ENABLED=false \
    GSA_AGENT_ID=ghostbrain-gsa-1 \
    REPO_ROOT=/repo \
    GSA_BUNDLE_DIR=/tmp/gsa-bundles

# Mount repo in read-only mode (agent is read-only by default)
VOLUME ["/repo"]

USER ghost
EXPOSE 7850

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:7850/health | grep -q '"ok":true'

ENTRYPOINT ["node", "src/index.js"]
