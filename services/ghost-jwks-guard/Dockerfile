FROM node:22.21.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 8090
CMD ["npm", "run", "start"]
