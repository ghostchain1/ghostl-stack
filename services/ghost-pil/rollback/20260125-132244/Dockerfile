FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY config ./config

RUN npm run build

EXPOSE 3220

CMD ["node", "dist/server.js"]
