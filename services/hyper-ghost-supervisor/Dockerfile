FROM node:22.21.0-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

FROM node:22.21.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Keep source available so schema/migrations can be read from disk without bundling.
COPY --from=builder /app/src ./src
RUN mkdir -p /var/lib/ghost/hgop && chown -R node:node /var/lib/ghost
USER node
EXPOSE 7077
CMD ["node", "dist/server.js"]
