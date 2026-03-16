FROM node:22.21.0-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY tsconfig.base.json .
COPY packages packages
COPY apps/web apps/web

RUN npm install --legacy-peer-deps

FROM deps AS dev
WORKDIR /app
COPY . .
WORKDIR /app/apps/web
EXPOSE 3200
CMD ["npm", "run", "dev"]

FROM deps AS builder
WORKDIR /app
RUN npm run build -w apps/web

FROM node:22.21.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/apps/web/.next-ghost/standalone ./
COPY --from=builder /app/apps/web/.next-ghost/static ./apps/web/.next-ghost/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
