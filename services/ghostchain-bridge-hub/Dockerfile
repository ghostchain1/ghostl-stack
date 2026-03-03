FROM node:22-alpine
RUN apk add --no-cache bash curl
# Preserve repo-root-relative paths so ../../.. imports resolve correctly
WORKDIR /repo
COPY packages/routing-guard ./packages/routing-guard
WORKDIR /repo/services/ghostchain-bridge-hub
COPY services/ghostchain-bridge-hub/package*.json ./
RUN npm install
COPY services/ghostchain-bridge-hub/tsconfig.json ./tsconfig.json
COPY services/ghostchain-bridge-hub/src ./src
RUN npx tsc --outDir dist
RUN npm prune --omit=dev
RUN chown -R node:node /repo/services/ghostchain-bridge-hub
USER node
EXPOSE 7720
CMD ["node", "dist/server.js"]
