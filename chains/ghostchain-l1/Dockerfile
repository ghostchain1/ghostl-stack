# ─────────────────────────────────────────────────────────────────────────────
# GhostGeth — Ghost-branded go-ethereum execution client for GhostChain L1
#
# Pinned to v1.13.14: last go-ethereum release supporting Clique (PoA) consensus.
# go-ethereum v1.14+ dropped Clique entirely — incompatible with GhostChain L1.
#
# Source patches applied to go-ethereum v1.13.14:
#   • params/version.go       VersionMeta  "stable"   → "ghostchain"
#   • cmd/geth/main.go        clientIdentifier "geth"  → "ghostgeth"
#   • cmd/geth/main.go        CLI usage string         → "GhostChain L1..."
#   • internal/version/*.go   fallback "geth %s"       → "ghostgeth %s"
#   • Binary renamed: build/bin/geth → build/bin/ghostgeth
#
# Resulting client identity (web3_clientVersion, P2P hello):
#   Ghostgeth/v1.13.14-ghostchain/linux-amd64/go1.22.x
# ─────────────────────────────────────────────────────────────────────────────

ARG GETH_VERSION=v1.13.14
ARG GO_VERSION=1.22-alpine

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM golang:${GO_VERSION} AS builder

ARG GETH_VERSION

RUN apk add --no-cache \
    git \
    make \
    gcc \
    musl-dev \
    linux-headers \
    bash

WORKDIR /build

# Clone pinned go-ethereum tag
RUN git clone --depth 1 --branch ${GETH_VERSION} \
    https://github.com/ethereum/go-ethereum.git .

# ── Apply Ghost branding patches ──────────────────────────────────────────────
# Verified against actual go-ethereum v1.14.11 source strings.
# Note: alpine BusyBox sed does not support \s — use literal spaces throughout.

# 1. params/version.go
#    VersionMeta has TWO spaces before '=' — must match exactly.
#    No VersionName constant exists in v1.14.x; clientIdentifier is the identity.
RUN sed -i \
        's/VersionMeta  = "stable"/VersionMeta  = "ghostchain"/' \
        params/version.go && \
    sed -i \
        's/VersionMeta  = "unstable"/VersionMeta  = "ghostchain-dev"/' \
        params/version.go

# 2. cmd/geth/main.go
#    clientIdentifier drives: node name, web3_clientVersion, and P2P hello msg.
#    flags.NewApp() sets the CLI usage/help description.
RUN sed -i \
        's/clientIdentifier = "geth"/clientIdentifier = "ghostgeth"/' \
        cmd/geth/main.go && \
    sed -i \
        's|flags.NewApp("the go-ethereum command line interface")|flags.NewApp("GhostChain L1 execution layer client")|' \
        cmd/geth/main.go

# 3. internal/version/version.go
#    Hardcoded "geth %s" fallbacks in versionInfo() — patch both occurrences.
RUN sed -i \
        's/fmt.Sprintf("geth %s"/fmt.Sprintf("ghostgeth %s"/g' \
        internal/version/version.go

# 4. Verify patches applied (build fails here if any sed missed)
RUN grep -q 'VersionMeta  = "ghostchain"' params/version.go && \
    grep -q 'clientIdentifier = "ghostgeth"' cmd/geth/main.go && \
    grep -q 'GhostChain L1' cmd/geth/main.go && \
    grep -q 'ghostgeth %s' internal/version/version.go && \
    echo "Ghost branding patches verified"

# ── Build binary ──────────────────────────────────────────────────────────────
RUN make geth && \
    mv build/bin/geth build/bin/ghostgeth && \
    strip build/bin/ghostgeth

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19 AS runtime

RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    bash \
    curl \
    jq

COPY --from=builder /build/build/bin/ghostgeth /usr/local/bin/ghostgeth

# Symlink as geth for tooling compatibility (e.g. ethkey, clef expectations)
RUN ln -s /usr/local/bin/ghostgeth /usr/local/bin/geth

# Create runtime directories
RUN mkdir -p /data /config /run

COPY scripts/init.sh  /usr/local/bin/ghostgeth-init
COPY scripts/run.sh   /usr/local/bin/ghostgeth-run
COPY config/genesis.json /config/genesis.json

RUN chmod +x /usr/local/bin/ghostgeth-init /usr/local/bin/ghostgeth-run

VOLUME ["/data"]
EXPOSE 8545 8546 30303 30303/udp 6060 8551

LABEL org.opencontainers.image.title="GhostGeth" \
      org.opencontainers.image.description="GhostChain L1 execution layer client (go-ethereum fork)" \
      org.opencontainers.image.vendor="GhostChain Foundation" \
      org.opencontainers.image.source="https://github.com/ghostmode25/ghostchain" \
      org.opencontainers.image.base.name="ethereum/go-ethereum"

ENTRYPOINT ["/usr/local/bin/ghostgeth-run"]
