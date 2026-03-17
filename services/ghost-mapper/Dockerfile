FROM node:22-alpine
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.revision=$VCS_REF \
  org.opencontainers.image.created=$BUILD_DATE \
  org.opencontainers.image.source="ghostl-stack"

RUN apk add --no-cache bash curl

WORKDIR /app

COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install --omit=dev

COPY src ./src
RUN chown -R node:node /app

EXPOSE 7780
USER node
CMD ["node", "src/index.js"]
