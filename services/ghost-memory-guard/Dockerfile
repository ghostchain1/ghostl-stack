FROM node:22-alpine

WORKDIR /app

COPY services/ghost-memory-guard /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

EXPOSE 7617

CMD ["node", "src/index.js"]
