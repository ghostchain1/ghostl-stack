# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && cp -r node_modules /tmp/prod_modules && npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: production ────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /tmp/prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN mkdir -p /app/logs

ENV NODE_ENV=production
ENV PORT=9987

EXPOSE 9987

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:9987/health || exit 1

CMD ["node", "dist/index.js"]
