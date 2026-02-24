FROM node:22-alpine

WORKDIR /app

RUN addgroup -S ghost && adduser -S ghost -G ghost

COPY services/ghostload-ai /app/services/ghostload-ai
COPY packages/ghostload-policy /app/packages/ghostload-policy

RUN chmod +x /app/services/ghostload-ai/healthcheck.sh

WORKDIR /app/services/ghostload-ai
USER ghost

ENV PORT=7688
EXPOSE 7688

CMD ["node", "src/index.js"]
