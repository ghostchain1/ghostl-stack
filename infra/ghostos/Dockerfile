FROM ubuntu:24.04

ARG NODE_VERSION=v22.22.0

ENV DEBIAN_FRONTEND=noninteractive \
    GHOSTOS_HOME=/opt/ghostos

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    docker.io \
    git \
    jq \
    tini \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install exact Node version (enforced by engine constraint >=22.21.0 <23)
RUN ARCH="$(dpkg --print-architecture)" && \
    case "$ARCH" in \
      amd64) NODE_ARCH="x64" ;; \
      arm64) NODE_ARCH="arm64" ;; \
      *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac && \
    curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" && \
    tar -xJf "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 && \
    rm "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"

RUN useradd -m -s /bin/bash ghost && \
    mkdir -p /opt/ghostos /var/log/ghostos /var/lib/ghostos && \
    chown -R ghost:ghost /opt/ghostos /var/log/ghostos /var/lib/ghostos

WORKDIR /opt/ghostos

# Install dependencies before copying source to maximise layer caching
COPY services/ghostos-core/package.json services/ghostos-core/tsconfig.json ./services/ghostos-core/
RUN cd services/ghostos-core && npm install

# Build TypeScript
COPY services/ghostos-core/src ./services/ghostos-core/src
RUN cd services/ghostos-core && npm run build

# Operator tooling
COPY infra/ghostos/motd.txt /etc/motd
COPY infra/ghostos/bin/ghost-status /usr/local/bin/ghost-status
RUN chmod +x /usr/local/bin/ghost-status && \
    printf '\nexport PATH=/usr/local/bin:$PATH\n[ -f /etc/motd ] && cat /etc/motd\n' \
      >> /home/ghost/.bashrc

USER ghost

EXPOSE 8484

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/opt/ghostos/services/ghostos-core/dist/index.js"]
