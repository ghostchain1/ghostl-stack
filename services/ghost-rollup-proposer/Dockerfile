FROM node:20-alpine AS base
WORKDIR /app
# install full deps so ts-node is available from devDependencies
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
EXPOSE 7272
# Use ts-node loader in ESM mode; skip type checking for speed.
ENV TS_NODE_TRANSPILE_ONLY=1
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/index.ts"]
