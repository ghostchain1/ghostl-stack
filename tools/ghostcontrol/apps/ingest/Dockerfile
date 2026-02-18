FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install
RUN pnpm --filter @ghostcontrol/ingest... build

FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

USER 1001:1001
CMD ["apps/ingest/dist/index.js"]
