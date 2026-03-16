# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web-wallet ./apps/web-wallet

RUN npm ci --ignore-scripts --legacy-peer-deps

ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p apps/web-wallet/public
RUN NEXT_IGNORE_INCORRECT_LOCKFILE=1 NEXT_DISABLE_ESLINT=1 npm run build --workspace=apps/web-wallet --ignore-scripts

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3021 \
    HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web-wallet/.next-ghost/standalone ./
COPY --from=builder /repo/apps/web-wallet/public ./apps/web-wallet/public
COPY --from=builder /repo/apps/web-wallet/.next-ghost/static ./apps/web-wallet/.next/static

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3021
CMD ["node", "apps/web-wallet/server.js"]
