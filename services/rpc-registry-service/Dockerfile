FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN mkdir -p dist/data && cp src/data/registry.json dist/data/registry.json
RUN npm prune --omit=dev

ENV PORT=8088
EXPOSE 8088

CMD ["node", "dist/server.js"]
