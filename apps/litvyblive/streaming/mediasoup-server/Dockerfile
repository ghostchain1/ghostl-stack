# mediasoup requires native build tools (python3, make, g++, linux-headers)
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ linux-headers
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Final image also needs build tools to run native mediasoup addon
FROM node:22-alpine
RUN apk add --no-cache python3 make g++ linux-headers
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 3000
# UDP port range for WebRTC RTP/RTCP
EXPOSE 40000-49999/udp

CMD ["node", "dist/index.js"]
