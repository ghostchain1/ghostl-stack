FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 9972
ENV NODE_ENV=production PORT=9972
CMD ["node", "dist/index.js"]
