FROM node:22.21.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/*/package.json apps/*/package.json
COPY packages/*/package.json packages/*/package.json
RUN npm install --include-workspace-root --workspaces

FROM deps AS dev
WORKDIR /app
COPY . .
WORKDIR /app/apps/web
EXPOSE 3200
CMD ["npm", "run", "dev"]

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build -w apps/web

FROM node:22.21.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.js ./apps/web/next.config.js
WORKDIR /app/apps/web
EXPOSE 3200
CMD ["npm", "run", "start"]
