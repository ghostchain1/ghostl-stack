FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src ./src
EXPOSE 7171
CMD ["node", "--experimental-strip-types", "src/index.ts"]
