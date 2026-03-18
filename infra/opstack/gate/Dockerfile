ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN apk add --no-cache curl
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
RUN apk add --no-cache curl \
  && addgroup -S opgate && adduser -S -G opgate -h /home/opgate opgate \
  && mkdir -p /state /home/opgate \
  && chown -R opgate:opgate /state /home/opgate /app
LABEL org.opencontainers.image.title="ghost-op-gate" \
      org.opencontainers.image.description="GhostChain branded OP transaction gate" \
      org.opencontainers.image.vendor="GhostChain" \
      org.opencontainers.image.documentation="https://github.com/ghostchain1/ghostl-stack/tree/main/infra/opstack/gate" \
      org.ghostchain.component="op-gate" \
      org.ghostchain.layer="l2-l3" \
      org.ghostchain.network="ghoststack"
COPY --from=base /app /app
COPY entrypoint.sh /usr/local/bin/ghost-op-gate-entrypoint.sh
RUN chmod +x /usr/local/bin/ghost-op-gate-entrypoint.sh
USER opgate
EXPOSE 8545
ENTRYPOINT ["/usr/local/bin/ghost-op-gate-entrypoint.sh"]
CMD ["node", "index.mjs"]
