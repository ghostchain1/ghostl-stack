FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY packages/ghost-sdk ./packages/ghost-sdk
COPY services/ghost-sequencer/package*.json ./services/ghost-sequencer/
WORKDIR /app/services/ghost-sequencer
RUN npm install
COPY services/ghost-sequencer/tsconfig.json ./tsconfig.json
COPY services/ghost-sequencer/src ./src
RUN chown -R node:node /app
USER node
EXPOSE 7261
ENV TS_NODE_TRANSPILE_ONLY=1
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/index.ts"]
