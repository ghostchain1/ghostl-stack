ARG OP_CHALLENGER_BASE_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-challenger:devnet
FROM ${OP_CHALLENGER_BASE_IMAGE}

LABEL org.opencontainers.image.title="ghost-op-challenger" \
      org.opencontainers.image.description="GhostChain branded OP challenger" \
      org.opencontainers.image.vendor="GhostChain" \
      org.opencontainers.image.documentation="https://github.com/ghostchain1/ghostl-stack/tree/main/infra/opstack/op-challenger" \
      org.ghostchain.component="op-challenger" \
      org.ghostchain.layer="l2-l3" \
      org.ghostchain.network="ghoststack"

COPY entrypoint.sh /usr/local/bin/ghost-op-challenger-entrypoint.sh
RUN chmod +x /usr/local/bin/ghost-op-challenger-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/ghost-op-challenger-entrypoint.sh"]
