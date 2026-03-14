FROM node:22-alpine
RUN apk add --no-cache bash curl

WORKDIR /app

COPY vendor ./vendor
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Copy static files needed at runtime (SQL migrations, policy YAML)
RUN cp -r src/db/migrations dist/src/db/migrations &&     cp src/db/seed-policy.yml dist/src/db/seed-policy.yml

EXPOSE 8090

RUN chown -R node:node /app
USER node
CMD ["node", "dist/src/server.js"]
