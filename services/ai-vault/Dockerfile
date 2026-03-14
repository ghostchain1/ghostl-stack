FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY policy.example.json ./policy.example.json
COPY policy.generated.json ./policy.generated.json

ENV NODE_ENV=production
EXPOSE 7710

RUN chown -R node:node /app
USER node
CMD ["npm", "start"]
