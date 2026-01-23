FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY apps/*/package.json apps/*/package.json
COPY packages/*/package.json packages/*/package.json
RUN npm install --include-workspace-root --workspaces

FROM deps AS dev
WORKDIR /app
COPY . .
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build -w packages/ghostwallet
RUN npm run build -w apps/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages ./packages
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
