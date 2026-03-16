FROM node:22-alpine

WORKDIR /workspace

COPY services/ghost-tx-engine /workspace/services/ghost-tx-engine
COPY packages/ghost-sdk-core /workspace/packages/ghost-sdk-core

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=384

WORKDIR /workspace/services/ghost-tx-engine

EXPOSE 7616

CMD ["node", "src/index.js"]
