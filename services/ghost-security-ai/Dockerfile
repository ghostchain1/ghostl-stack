# ── stage 1: install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --production

# ── stage 2: compile typescript ────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

# ── stage 3: minimal runtime image ─────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# non-root user
RUN addgroup -S ssa && adduser -S ssa -G ssa

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY package.json ./

USER ssa
EXPOSE 7990
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
