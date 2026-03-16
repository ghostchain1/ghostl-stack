FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm install --omit=dev \
 && apk del .build-deps

COPY src ./src
COPY policy.example.json ./policy.example.json
COPY policy.generated.json ./policy.generated.json

ENV NODE_ENV=production
EXPOSE 7710

RUN chown -R node:node /app
USER node
CMD ["npm", "start"]
