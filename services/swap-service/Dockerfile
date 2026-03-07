FROM node:22-alpine AS base

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=7670

EXPOSE 7670

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:7670/health || exit 1

CMD ["node", "src/index.js"]
