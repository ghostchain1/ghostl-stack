FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app

# Install full dependencies so ts-node is available at runtime.
COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install

COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY entrypoint.sh /entrypoint.sh
COPY healthcheck.sh /healthcheck.sh
RUN chmod +x /entrypoint.sh /healthcheck.sh

ENV TS_NODE_TRANSPILE_ONLY=1
ENV PORT=3310

EXPOSE 3310

ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/server.ts"]

