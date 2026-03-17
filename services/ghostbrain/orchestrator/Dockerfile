FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build 2>/dev/null || true

FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
