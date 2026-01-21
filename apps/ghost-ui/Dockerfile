FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ARG NEXT_PUBLIC_COMPLIANCE_URL=http://localhost:8090
ENV NEXT_PUBLIC_COMPLIANCE_URL=$NEXT_PUBLIC_COMPLIANCE_URL

RUN npm run build

EXPOSE 3200

CMD ["npm", "run", "start"]
