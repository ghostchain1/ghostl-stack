FROM node:22.21.0-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY migrations ./migrations

RUN addgroup -g 10001 ghost && adduser -D -u 10001 -G ghost ghost
USER 10001:10001

EXPOSE 7685

CMD ["node", "src/index.js"]
