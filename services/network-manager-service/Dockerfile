FROM node:22-alpine
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.revision=$VCS_REF \
  org.opencontainers.image.created=$BUILD_DATE \
  org.opencontainers.image.source="ghostl-stack"

RUN apk add --no-cache bash curl

# /workspace mirrors the monorepo layout so file:../../packages/ghost-sdk resolves correctly
WORKDIR /workspace
COPY packages/ghost-sdk/ ./packages/ghost-sdk/

WORKDIR /workspace/services/network-manager-service
COPY services/network-manager-service/package.json ./
# Use --install-links to copy file: deps so ethers is hoisted into service node_modules
RUN npm config set fetch-retries 5 && \
    npm config set fetch-timeout 600000 && \
    npm install --omit=dev --install-links
COPY services/network-manager-service/src ./src
RUN chown -R node:node /workspace

EXPOSE 7766
USER node
CMD ["node", "src/index.js"]
