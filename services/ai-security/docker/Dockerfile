FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl iptables

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

# ASE_ENABLE_IPTABLES=true enables live IP blocking via iptables.
# Requires NET_ADMIN capability: docker run --cap-add NET_ADMIN
EXPOSE 9976

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:9976/health || exit 1

CMD ["node", "dist/index.js"]
