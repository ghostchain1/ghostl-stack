FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src ./src
EXPOSE 8110
ENV NODE_ENV=production PORT=8110
CMD ["node", "src/index.js"]
