FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY services/liquidity-router/package.json ./
RUN npm install
COPY services/liquidity-router/tsconfig.json ./tsconfig.json
COPY services/liquidity-router/src ./src
# transpile to JS to avoid experimental flags
RUN npx tsc --outDir dist
RUN npm prune --omit=dev
RUN chown -R node:node /app
USER node
EXPOSE 7607
CMD ["node", "dist/index.js"]
