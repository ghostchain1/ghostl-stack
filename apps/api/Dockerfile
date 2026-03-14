FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build workspace package.json
RUN python3 -c "import json; json.dump({'private': True, 'workspaces': ['packages/ghost', 'packages/ghost-sdk', 'packages/contract-schemas', 'packages/auth', 'packages/ghostwallet', 'packages/routing-guard', 'packages/routing-law', 'apps/api']}, open('package.json', 'w'))"

# Copy workspace packages needed by the API
COPY packages/ghost packages/ghost
COPY packages/ghost-sdk packages/ghost-sdk
COPY packages/contract-schemas packages/contract-schemas
COPY packages/auth packages/auth
COPY packages/ghostwallet packages/ghostwallet
COPY packages/routing-guard packages/routing-guard
COPY packages/routing-law packages/routing-law

# Copy observability AI modules (used by API log-intel module)
COPY observability observability

# Copy the base tsconfig and API source
COPY tsconfig.base.json .
COPY apps/api apps/api

# Install all dependencies (network access enables prebuilt native binaries)
RUN npm install --legacy-peer-deps

# Build TypeScript workspace packages needed at runtime
RUN npm run build --workspace=packages/ghost-sdk
RUN npm run build --workspace=packages/ghost

# Install tsx for TypeScript execution
RUN npm install -g tsx

# Create data directories with proper ownership for all SQLite DBs and JSON stores
RUN mkdir -p /app/apps/api/data /home/ghost/ghostl-stack/apps/api/data && chown -R node:node /app/apps/api/data /home/ghost/ghostl-stack/apps/api/data

WORKDIR /app/apps/api
EXPOSE 4000

USER node
CMD ["tsx", "src/server.ts"]
