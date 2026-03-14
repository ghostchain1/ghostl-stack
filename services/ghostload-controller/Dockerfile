FROM node:22-alpine

WORKDIR /app

RUN addgroup -S ghost && adduser -S ghost -G ghost

COPY services/ghostload-controller /app/services/ghostload-controller
COPY packages/ghostload-policy /app/packages/ghostload-policy

RUN chmod +x /app/services/ghostload-controller/healthcheck.sh

WORKDIR /app/services/ghostload-controller
USER ghost

ENV PORT=7689
EXPOSE 7689

CMD ["node", "src/index.js"]
