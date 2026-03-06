FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install --omit=dev
COPY src ./src
RUN chown -R node:node /app
USER node
EXPOSE 7640
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:7640/health || exit 1
CMD ["node", "src/index.js"]
