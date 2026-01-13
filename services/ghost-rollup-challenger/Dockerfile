FROM node:20-alpine AS base
WORKDIR /app
# install full deps so ts-node is available from devDependencies
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./tsconfig.json
COPY src ./src
EXPOSE 7282
# Node 20 can strip types at runtime; avoids ts-node/ESM loader issues.
CMD ["node", "--experimental-strip-types", "src/index.ts"]
