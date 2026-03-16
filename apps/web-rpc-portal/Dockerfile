# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web-rpc-portal ./apps/web-rpc-portal

RUN npm ci --ignore-scripts --legacy-peer-deps

ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p apps/web-rpc-portal/public
RUN NEXT_IGNORE_INCORRECT_LOCKFILE=1 NEXT_DISABLE_ESLINT=1 npm run build --workspace=apps/web-rpc-portal --ignore-scripts

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3026 \
    HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web-rpc-portal/.next-ghost/standalone ./
COPY --from=builder /repo/apps/web-rpc-portal/public ./apps/web-rpc-portal/public
COPY --from=builder /repo/apps/web-rpc-portal/.next-ghost/static ./apps/web-rpc-portal/.next/static

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3026
CMD ["node", "apps/web-rpc-portal/server.js"]
