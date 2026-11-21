FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --legacy-peer-deps
RUN npx prisma generate

COPY . .

EXPOSE 3001

CMD ["sh", "-c", "npm install --legacy-peer-deps && npx prisma db push --accept-data-loss && npm run start:dev"]
