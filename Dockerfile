FROM node:20-alpine AS base

# Install OpenSSL and libc compatibility for Prisma engine on Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy package manifests and Prisma schema first for layer caching
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
ENV DATABASE_URL="mysql://mock_user:mock_pass@localhost:3306/mock_db"
RUN npm ci || npm install
RUN npx prisma generate

# Copy the rest of the application source code
COPY . .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
