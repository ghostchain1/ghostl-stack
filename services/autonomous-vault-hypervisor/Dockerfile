FROM alpine:3.22 AS tools

RUN apk add --no-cache openssh-client libvirt-client docker-cli \
  && mkdir -p /opt/tools/bin /opt/tools/lib \
  && for bin in /usr/bin/ssh /usr/bin/virsh /usr/bin/docker; do \
      cp -L "$bin" /opt/tools/bin/; \
      ldd "$bin" | awk '$3 ~ /^\// {print $3} $1 ~ /^\// {print $1}' | sort -u | xargs -r -I{} cp -L "{}" /opt/tools/lib/; \
    done \
  && if [ -f /lib/ld-musl-x86_64.so.1 ]; then cp -L /lib/ld-musl-x86_64.so.1 /opt/tools/lib/; fi

FROM node:22-alpine AS builder

WORKDIR /build

# Install dependencies for build
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev


# ─── Production image ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=tools /opt/tools /opt/tools
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node package.json ./

COPY --from=builder --chown=node:node /build/dist ./dist
COPY --chown=node:node policy.json ./policy.json

ENV NODE_ENV=production
ENV PATH="/opt/tools/bin:${PATH}"
ENV LD_LIBRARY_PATH="/opt/tools/lib"
EXPOSE 7720

USER node

CMD ["node", "dist/index.js"]
