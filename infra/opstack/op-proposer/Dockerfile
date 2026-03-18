ARG OP_PROPOSER_BASE_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-proposer:v1.10.0
FROM ${OP_PROPOSER_BASE_IMAGE}

LABEL org.opencontainers.image.title="ghost-op-proposer" \
      org.opencontainers.image.description="GhostChain branded OP proposer" \
      org.opencontainers.image.vendor="GhostChain" \
      org.opencontainers.image.documentation="https://github.com/ghostchain1/ghostl-stack/tree/main/infra/opstack/op-proposer" \
      org.ghostchain.component="op-proposer" \
      org.ghostchain.layer="l2-l3" \
      org.ghostchain.network="ghoststack"

COPY entrypoint.sh /usr/local/bin/ghost-op-proposer-entrypoint.sh
RUN chmod +x /usr/local/bin/ghost-op-proposer-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/ghost-op-proposer-entrypoint.sh"]
