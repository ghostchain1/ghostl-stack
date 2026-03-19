FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY packages/ghost-sdk ./packages/ghost-sdk
COPY services/ghost-exec/package*.json ./services/ghost-exec/
WORKDIR /app/services/ghost-exec
RUN npm install
COPY services/ghost-exec/tsconfig.json ./tsconfig.json
COPY services/ghost-exec/src ./src
RUN chown -R node:node /app
USER node
EXPOSE 7260
ENV TS_NODE_TRANSPILE_ONLY=1
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/index.ts"]
