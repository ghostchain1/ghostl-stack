FROM node:22.21.0-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --omit=optional
COPY src ./src
RUN npm run build && npm prune --omit=dev

RUN useradd -u 10001 -m ghostsvc
USER ghostsvc

ENV NODE_ENV=production
EXPOSE 7662
CMD ["node", "dist/index.js"]
