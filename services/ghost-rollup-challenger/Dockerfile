FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
# install full deps so ts-node is available from devDependencies
COPY packages/ghost-sdk ./packages/ghost-sdk
COPY services/ghost-rollup-challenger/package*.json ./services/ghost-rollup-challenger/
WORKDIR /app/services/ghost-rollup-challenger
RUN npm install
COPY services/ghost-rollup-challenger/tsconfig.json ./tsconfig.json
COPY services/ghost-rollup-challenger/src ./src
RUN chown -R node:node /app
USER node
EXPOSE 7282
# Use ts-node loader in ESM mode; skip type checking for speed.
ENV TS_NODE_TRANSPILE_ONLY=1
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/index.ts"]
