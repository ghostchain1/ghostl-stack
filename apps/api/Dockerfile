FROM node:22.21.0-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/*/package.json apps/*/package.json
COPY packages/*/package.json packages/*/package.json
RUN npm ci --include-workspace-root --workspaces

FROM deps AS dev
WORKDIR /app
COPY . .
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build -w packages/ghostwallet
RUN npm run build -w apps/api

FROM node:22.21.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages ./packages
WORKDIR /app/apps/api
EXPOSE 4000
USER node
CMD ["node", "dist/server.js"]
