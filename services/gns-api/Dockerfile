FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
LABEL maintainer="GhostStack" \
      com.ghost.service="gns-api" \
      com.ghost.layer="infra"

ENV NODE_ENV=production

WORKDIR /app
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

RUN groupadd -r ghost && useradd -r -g ghost ghost
USER ghost

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
