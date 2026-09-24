# Stage 1: Cài dependencies production
FROM node:20-alpine AS deps

WORKDIR /app

# Cài công cụ cần thiết để build argon2
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --omit=dev


# Stage 2: Image production
FROM node:20-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Cấp quyền thực thi cho entrypoint
RUN chmod +x docker-entrypoint.sh

# Chạy dưới user non-root
USER node

# Readiness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/ready" || exit 1

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]