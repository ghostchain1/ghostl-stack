FROM node:22-alpine@sha256:48f53c3f0105ccddcc5e4f520347398dfc0ba9b3008fbfd98a2add27e5797957

RUN apk add --no-cache curl
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY migrations ./migrations
COPY src ./src

RUN chown -R node:node /app
USER node

ENV PORT=7683
EXPOSE 7683

CMD ["node", "src/index.js"]
