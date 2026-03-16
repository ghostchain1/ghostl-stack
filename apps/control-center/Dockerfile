# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/control-center ./apps/control-center

RUN npm ci --ignore-scripts --legacy-peer-deps

ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p apps/control-center/public
RUN npm run build --workspace=apps/control-center --ignore-scripts

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3027 \
    HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/control-center/.next-ghost/standalone ./
COPY --from=builder /repo/apps/control-center/public ./apps/control-center/public
COPY --from=builder /repo/apps/control-center/.next-ghost/static ./apps/control-center/.next/static

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3027
CMD ["node", "apps/control-center/server.js"]
