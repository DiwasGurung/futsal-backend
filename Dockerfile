FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN apk add --no-cache openssl
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" DIRECT_URL="postgresql://build:build@localhost:5432/build" npm ci \
    && DATABASE_URL="postgresql://build:build@localhost:5432/build" DIRECT_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
    && npm prune --omit=dev
COPY src ./src
ENV NODE_ENV=production
EXPOSE 5000
USER node
CMD ["node", "src/server.js"]
