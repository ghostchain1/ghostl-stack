# ghost-geth — GhostChain L1 execution client image
#
# Extends the upstream go-ethereum "alltools" image with GhostChain branding
# and a thin wrapper entrypoint. The underlying geth binary is unmodified;
# this image simply provides a well-known GhostChain registry path so that
# GETH_IMAGE can be set to ghostchain/ghost-geth:<tag> instead of the
# upstream ethereum/client-go:<tag>.
#
# Build:
#   docker build -t ghostchain/ghost-geth:v1.13.14 \
#     --build-arg GETH_TAG=alltools-v1.13.14 .
#
# Run (drop-in replacement):
#   docker run ghostchain/ghost-geth:v1.13.14 geth --help

ARG GETH_TAG=alltools-v1.13.14
FROM ethereum/client-go:${GETH_TAG}

LABEL org.opencontainers.image.title="ghost-geth" \
      org.opencontainers.image.description="GhostChain L1 execution client (go-ethereum alltools)" \
      org.opencontainers.image.vendor="ghostchain1" \
      org.opencontainers.image.url="https://github.com/ghostchain1/ghostl-stack" \
      org.opencontainers.image.documentation="https://github.com/ghostchain1/ghostl-stack/tree/main/infra/ghost-geth" \
      org.opencontainers.image.version="${GETH_TAG}" \
      org.ghostchain.component="l1-execution-client" \
      org.ghostchain.network="ghostchain-l1"

# Ghost-branded entrypoint wrapper: logs the ghost-geth banner then delegates
# to the original binary. Overriding CMD still works as expected.
COPY entrypoint.sh /usr/local/bin/ghost-geth-entrypoint.sh
RUN chmod +x /usr/local/bin/ghost-geth-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/ghost-geth-entrypoint.sh"]
# Default: start geth so `docker run ghostchain/ghost-geth` works out of the box
CMD ["geth"]
