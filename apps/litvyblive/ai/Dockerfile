FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline
COPY src ./src
EXPOSE 7002
CMD ["node", "src/index.js"]
