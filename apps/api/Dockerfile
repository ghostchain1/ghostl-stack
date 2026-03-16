FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json .
COPY packages packages
COPY observability observability
COPY apps/api apps/api

RUN npm install --legacy-peer-deps

# Install tsx for TypeScript execution
RUN npm install -g tsx

# Create data directories with proper ownership for all SQLite DBs and JSON stores
RUN mkdir -p /app/apps/api/data /home/ghost/ghostl-stack/apps/api/data && chown -R node:node /app/apps/api/data /home/ghost/ghostl-stack/apps/api/data

WORKDIR /app/apps/api
EXPOSE 4000

USER node
CMD ["tsx", "src/server.ts"]
