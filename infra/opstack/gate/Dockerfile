ARG NODE_IMAGE=node@sha256:40dc4b415c17b85bea9be05314b4a753f45a4e1716bb31c01182e6c53d51a654

FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN apk add --no-cache curl
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
RUN apk add --no-cache curl \
  && addgroup -S opgate && adduser -S -G opgate -h /home/opgate opgate \
  && mkdir -p /state /home/opgate \
  && chown -R opgate:opgate /state /home/opgate /app
COPY --from=base /app /app
USER opgate
EXPOSE 8545
CMD ["node", "index.mjs"]
