FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src ./src
ENV NODE_ENV=production
USER node
EXPOSE 7070
CMD ["node", "--experimental-strip-types", "src/index.ts"]
