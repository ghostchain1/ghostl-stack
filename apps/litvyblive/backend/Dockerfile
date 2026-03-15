FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build 2>/dev/null || true

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src  ./src
EXPOSE 7001
CMD ["node", "--import=tsx/esm", "src/index.ts"]
