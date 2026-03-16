FROM node:22-alpine

WORKDIR /workspace

COPY services/ghost-rpc-aggregator /workspace/services/ghost-rpc-aggregator
COPY packages/ghost-sdk-core /workspace/packages/ghost-sdk-core

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

WORKDIR /workspace/services/ghost-rpc-aggregator

EXPOSE 7615

CMD ["node", "src/index.js"]
