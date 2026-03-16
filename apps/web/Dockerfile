FROM node:22.21.0-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Build a minimal workspace package.json referencing only the packages
# that apps/web directly depends on — avoids copying 50+ workspace manifests.
RUN python3 -c "import json; json.dump({'private': True, 'workspaces': ['packages/ghost-sdk', 'packages/api-client', 'packages/auth', 'packages/contract-schemas', 'packages/ui', 'apps/web']}, open('package.json', 'w'))"

# Copy only the workspace packages the web app depends on
COPY packages/ghost-sdk packages/ghost-sdk
COPY packages/api-client packages/api-client
COPY packages/auth packages/auth
COPY packages/contract-schemas packages/contract-schemas
COPY packages/ui packages/ui
COPY tsconfig.base.json .
COPY apps/web apps/web

RUN npm install --legacy-peer-deps

FROM deps AS dev
WORKDIR /app
COPY . .
WORKDIR /app/apps/web
EXPOSE 3200
CMD ["npm", "run", "dev"]

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build -w apps/web

FROM node:22.21.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/apps/web/.next-ghost/standalone ./
COPY --from=builder /app/apps/web/.next-ghost/static ./apps/web/.next-ghost/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
