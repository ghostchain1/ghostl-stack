FROM node:22-alpine
RUN apk add --no-cache bash curl wget
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npx tsc --outDir dist
EXPOSE 7070
CMD ["node", "dist/index.js"]
