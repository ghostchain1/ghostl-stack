FROM golang:1.22-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git make gcc musl-dev linux-headers

# Cache go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN make build

# ─── Runtime image ───────────────────────────────────────────────────────────

FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl jq bash

WORKDIR /root

# Copy binary
COPY --from=builder /build/build/ghostchaind /usr/local/bin/ghostchaind

# Chain home directory
ENV GHOST_HOME=/root/.ghostchaind
ENV CHAIN_ID=ghostchain-1
ENV GHOST_AI_ORACLE_ADDR=""

EXPOSE 26657 26656 9090 1317

VOLUME ["/root/.ghostchaind"]

# Entrypoint: auto-init if no existing state, then start
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["start"]
