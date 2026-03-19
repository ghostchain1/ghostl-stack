FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY packages/ghost-sdk ./packages/ghost-sdk
COPY services/ghost-bridge/package*.json ./services/ghost-bridge/
WORKDIR /app/services/ghost-bridge
RUN npm install
COPY services/ghost-bridge/tsconfig.json ./tsconfig.json
COPY services/ghost-bridge/src ./src
RUN chown -R node:node /app
USER node
VOLUME ["/state"]
EXPOSE 7264
ENV TS_NODE_TRANSPILE_ONLY=1
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/index.ts"]
