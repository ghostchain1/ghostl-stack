ARG OP_NODE_BASE_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node:v1.10.0
FROM ${OP_NODE_BASE_IMAGE}

LABEL org.opencontainers.image.title="ghost-op-node" \
      org.opencontainers.image.description="GhostChain branded OP rollup node" \
      org.opencontainers.image.vendor="GhostChain" \
      org.opencontainers.image.documentation="https://github.com/ghostchain1/ghostl-stack/tree/main/infra/opstack/op-node" \
      org.ghostchain.component="op-node" \
      org.ghostchain.layer="l2-l3" \
      org.ghostchain.network="ghoststack"

COPY entrypoint.sh /usr/local/bin/ghost-op-node-entrypoint.sh
RUN chmod +x /usr/local/bin/ghost-op-node-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/ghost-op-node-entrypoint.sh"]
