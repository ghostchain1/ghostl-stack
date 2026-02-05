FROM node:22-alpine
RUN apk add --no-cache bash curl

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev
RUN chown -R node:node /app
USER node

ENV PORT=8088
EXPOSE 8088

CMD ["node", "dist/server.js"]
