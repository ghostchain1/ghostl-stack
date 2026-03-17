FROM node:22-alpine AS base
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.revision=$VCS_REF \
  org.opencontainers.image.created=$BUILD_DATE \
  org.opencontainers.image.source="ghostl-stack"

RUN apk add --no-cache bash curl

# /workspace mirrors the monorepo layout so file:../../packages/ghost-sdk resolves correctly
WORKDIR /workspace
COPY packages/ghost-sdk/ ./packages/ghost-sdk/

WORKDIR /workspace/services/consensus-telemetry-service
COPY services/consensus-telemetry-service/package.json ./
# Delete stale lockfile; use --install-links to copy file: deps (not symlink)
# so transitive deps (ethers etc.) are resolved from the service's node_modules
RUN rm -f package-lock.json && \
    npm config set fetch-retries 5 && \
    npm config set fetch-timeout 600000 && \
    npm install --omit=dev --install-links
COPY services/consensus-telemetry-service/src ./src
RUN chown -R node:node /workspace

EXPOSE 7635
USER node
CMD ["node", "src/index.js"]
