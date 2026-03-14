FROM node:22-alpine
RUN apk add --no-cache bash curl

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY config ./config
COPY src ./src
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

RUN npm run build
RUN npm prune --omit=dev

ENV PORT=3210
EXPOSE 3210

RUN chown -R node:node /app
USER node
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server.js"]
