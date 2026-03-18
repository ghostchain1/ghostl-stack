FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache git docker-cli docker-cli-compose
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY config/ ./config/
ENV NODE_ENV=production
EXPOSE 7950
CMD ["node", "dist/index.js"]
