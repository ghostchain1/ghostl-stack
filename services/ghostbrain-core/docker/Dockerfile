FROM node:22-alpine AS builder

WORKDIR /app

# Install build deps (needed for native modules if any)
RUN apk add --no-cache python3 make g++

# Copy manifests first for caching
COPY services/ghostbrain-core/package.json services/ghostbrain-core/tsconfig.json ./

# Install all deps (including devDependencies for build)
RUN npm install --include=dev

# Copy source
COPY services/ghostbrain-core/src/ ./src/

# Compile TypeScript
RUN npm run build 2>/dev/null || npx tsc --outDir dist

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Only production deps
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev

# Compiled JS
COPY --from=builder /app/dist ./dist

# Memory dir
RUN mkdir -p /var/ghostbrain/memory
VOLUME ["/var/ghostbrain/memory"]

EXPOSE 7900

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:7900/readyz || exit 1

CMD ["node", "dist/index.js"]
