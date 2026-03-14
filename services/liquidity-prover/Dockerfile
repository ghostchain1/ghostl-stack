FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
COPY services/liquidity-prover/package.json ./
RUN npm install
COPY services/liquidity-prover/tsconfig.json ./tsconfig.json
COPY services/liquidity-prover/src ./src
RUN npx tsc --outDir dist
RUN npm prune --omit=dev
RUN chown -R node:node /app
USER node
EXPOSE 7611
CMD ["node", "dist/index.js"]

