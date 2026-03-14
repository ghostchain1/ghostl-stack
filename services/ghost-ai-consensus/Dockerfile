FROM node:22-alpine
RUN apk add --no-cache bash curl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npx tsc --outDir dist
RUN npm prune --omit=dev
RUN chown -R node:node /app
USER node
EXPOSE 7715
CMD ["node", "dist/server.js"]
