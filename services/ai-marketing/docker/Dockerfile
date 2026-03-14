FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 9970

ENV NODE_ENV=production
ENV PORT=9970

CMD ["node", "dist/index.js"]
