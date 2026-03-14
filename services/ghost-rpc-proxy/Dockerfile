FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY index.mjs ./
RUN chown -R node:node /app
USER node
EXPOSE 8546
CMD ["node", "index.mjs"]
