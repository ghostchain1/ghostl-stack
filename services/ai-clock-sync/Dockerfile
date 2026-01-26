# Simple clock drift monitor for Ghostchain, L2, and L3
FROM node:22-alpine
RUN apk add --no-cache bash curl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set registry https://registry.npmjs.org \
  && npm config set fetch-retries 5 \
  && npm config set fetch-timeout 600000 \
  && npm ci --omit=dev --no-audit --no-fund
COPY index.js ./
ENV NODE_ENV=production
CMD ["node", "index.js"]
