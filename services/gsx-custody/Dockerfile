FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src ./src
EXPOSE 8103
ENV NODE_ENV=production PORT=8103
CMD ["node", "src/index.js"]
