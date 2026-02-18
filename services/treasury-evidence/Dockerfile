FROM node:22-alpine
RUN apk add --no-cache bash curl

WORKDIR /app
COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install --production || (echo "npm install failed, retrying in 5s" && sleep 5 && npm install --production)

COPY bin ./bin
COPY src ./src

RUN chown -R node:node /app
USER node

CMD ["node", "src/index.js"]

