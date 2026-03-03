FROM node:22-alpine AS base
RUN apk add --no-cache bash curl
WORKDIR /app
# Copy package files from service dir (build context = workspace root)
COPY services/bridge-service/package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install --production || (echo "npm install failed, retrying in 5s" && sleep 5 && npm install --production)
COPY services/bridge-service/src ./src
# Copy only the routing-guard package (the only one used by bridge-service)
COPY packages/routing-guard /packages/routing-guard
RUN chown -R node:node /app /packages/routing-guard
USER node
EXPOSE 7604
CMD ["node", "src/index.js"]
