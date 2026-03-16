FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Minimal workspace — only gateway and its deps
RUN python3 -c "import json; json.dump({'private': True, 'workspaces': ['apps/gateway']}, open('package.json', 'w'))"

COPY apps/gateway apps/gateway
COPY tsconfig.base.json .

RUN npm install --prefix apps/gateway

# ── Builder ────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
RUN npm run build --prefix apps/gateway

# ── Runner ─────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

COPY --from=builder /app/apps/gateway/dist ./dist
COPY --from=builder /app/apps/gateway/node_modules ./node_modules
COPY --from=builder /app/apps/gateway/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "dist/server.js"]
