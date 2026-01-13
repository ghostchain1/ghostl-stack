FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
# transpile to JS to avoid experimental flags
RUN npx tsc --outDir dist
EXPOSE 7171
CMD ["node", "dist/index.js"]
