FROM node:22-alpine
RUN apk add --no-cache bash curl

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev
RUN addgroup -g 10001 -S ghost \
	&& adduser -u 10001 -S -D -H -G ghost ghost \
	&& chown -R ghost:ghost /app
USER ghost:ghost

ENV PORT=7813
EXPOSE 7813

CMD ["node", "dist/server.js"]
