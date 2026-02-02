FROM node:22-alpine
RUN apk add --no-cache bash curl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

CMD ["node", "dist/worker.js"]
