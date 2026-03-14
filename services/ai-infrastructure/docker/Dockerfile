FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

# Mount /var/run/docker.sock to enable Docker supervision.
# Run with: -v /var/run/docker.sock:/var/run/docker.sock
EXPOSE 9975

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:9975/health || exit 1

CMD ["node", "dist/index.js"]
