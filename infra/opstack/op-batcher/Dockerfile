ARG OP_BATCHER_BASE_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-batcher:v1.10.0
FROM ${OP_BATCHER_BASE_IMAGE}

LABEL org.opencontainers.image.title="ghost-op-batcher" \
      org.opencontainers.image.description="GhostChain branded OP batcher" \
      org.opencontainers.image.vendor="GhostChain" \
      org.opencontainers.image.documentation="https://github.com/ghostchain1/ghostl-stack/tree/main/infra/opstack/op-batcher" \
      org.ghostchain.component="op-batcher" \
      org.ghostchain.layer="l2-l3" \
      org.ghostchain.network="ghoststack"

COPY entrypoint.sh /usr/local/bin/ghost-op-batcher-entrypoint.sh
RUN chmod +x /usr/local/bin/ghost-op-batcher-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/ghost-op-batcher-entrypoint.sh"]
