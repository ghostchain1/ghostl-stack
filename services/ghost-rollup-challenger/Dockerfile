FROM node:20-alpine AS base
WORKDIR /app
# install full deps so ts-node is available from devDependencies
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
EXPOSE 7282
# Use ts-node ESM transpile-only for fast startup.
CMD ["npx", "ts-node-esm", "--transpile-only", "src/index.ts"]
