FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
RUN npm run build
ENV NODE_ENV=production
EXPOSE 7070
CMD ["node", "dist/index.js"]
