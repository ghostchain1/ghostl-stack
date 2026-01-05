FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src ./src
USER node
EXPOSE 7600
CMD ["node", "src/index.js"]
