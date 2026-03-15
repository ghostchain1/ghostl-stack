# edge-nodes also uses mediasoup: needs native build tools
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ linux-headers
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache python3 make g++ linux-headers
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 3003
EXPOSE 41000-41999/udp

CMD ["node", "dist/index.js"]
