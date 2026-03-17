FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 8132
ENV NODE_ENV=production PORT=8132
CMD ["node", "src/index.js"]
