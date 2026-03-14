# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci --silent
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --silent
COPY --from=builder /build/dist ./dist

ENV NODE_ENV=production
ENV PORT=9983

EXPOSE 9983

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:9983/health || exit 1

CMD ["node", "dist/index.js"]
