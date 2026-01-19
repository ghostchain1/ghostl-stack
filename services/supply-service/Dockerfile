FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000 \
 && npm install --production || (echo "npm install failed, retrying in 5s" && sleep 5 && npm install --production)
COPY src ./src
EXPOSE 7614
CMD ["node", "src/index.js"]
