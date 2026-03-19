FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 7276
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:7276/healthz || exit 1
CMD ["node", "--loader", "ts-node/esm", "--no-warnings", "--experimental-specifier-resolution=node", "src/index.ts"]
