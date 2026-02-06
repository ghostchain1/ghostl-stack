FROM node:22-bullseye-slim AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install
RUN pnpm --filter @ghostcontrol/ui... build

FROM node:22-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

USER 10001:10001
WORKDIR /app/apps/ui
CMD ["node", "../../node_modules/next/dist/bin/next", "start", "-p", "3000"]
