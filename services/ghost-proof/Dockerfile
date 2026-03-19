FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY packages/ghost-sdk ./packages/ghost-sdk
COPY services/ghost-proof/package*.json ./services/ghost-proof/
WORKDIR /app/services/ghost-proof
RUN npm install
COPY services/ghost-proof/tsconfig.json ./tsconfig.json
COPY services/ghost-proof/src ./src
RUN chown -R node:node /app
USER node
VOLUME ["/state"]
EXPOSE 7265
ENV TS_NODE_TRANSPILE_ONLY=1
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/index.ts"]
