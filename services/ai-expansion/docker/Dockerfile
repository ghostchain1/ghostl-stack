FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 9973
ENV NODE_ENV=production PORT=9973
CMD ["node", "dist/index.js"]
