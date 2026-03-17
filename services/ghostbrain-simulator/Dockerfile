FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
COPY scenarios/ ./scenarios/
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY scenarios/ ./scenarios/
ENV NODE_ENV=production
EXPOSE 7960
CMD ["node", "dist/server.js"]
