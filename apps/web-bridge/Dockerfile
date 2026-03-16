# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web-bridge ./apps/web-bridge

RUN npm ci --ignore-scripts --legacy-peer-deps

ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p apps/web-bridge/public
RUN NEXT_IGNORE_INCORRECT_LOCKFILE=1 NEXT_DISABLE_ESLINT=1 npm run build --workspace=apps/web-bridge --ignore-scripts

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3022 \
    HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web-bridge/.next-ghost/standalone ./
COPY --from=builder /repo/apps/web-bridge/public ./apps/web-bridge/public
COPY --from=builder /repo/apps/web-bridge/.next-ghost/static ./apps/web-bridge/.next/static

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3022
CMD ["node", "apps/web-bridge/server.js"]
