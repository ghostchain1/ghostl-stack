FROM node:22-alpine
RUN apk add --no-cache bash curl

WORKDIR /app

COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install --production

COPY src ./src

EXPOSE 7766
CMD ["node", "src/index.js"]
