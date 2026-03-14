FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runner
RUN addgroup -S gni && adduser -S gni -G gni
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER gni
EXPOSE 7970
ENV GNI_PORT=7970
CMD ["node", "dist/server.js"]
