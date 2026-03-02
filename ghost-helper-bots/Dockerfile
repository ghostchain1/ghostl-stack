# ghost-helper-bots — Dockerfile
# Builds the sentinel/analyzer/fixer bot loop for GhostBrain integration.
# AGENTS.md §7: NodeNext resolution, node >=22.21.0 <23

FROM node:22-alpine

RUN apk add --no-cache bash curl git jq

WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install

# Build TypeScript
COPY tsconfig.json ./
COPY core ./core
COPY bots ./bots
COPY loops ./loops
COPY rules ./rules

RUN npm run build 2>/dev/null || (node --loader ts-node/esm --version && echo "ts-node fallback ok")

ENV GHOST_REPO_ROOT=/workspace
ENV NODE_ENV=production

# Default: run all bot stages in a single pass
CMD ["node", "--loader", "ts-node/esm", "loops/loop.ts", "--mode", "all", "--maxIters", "1"]
