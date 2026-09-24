# Stage 1: Cài dependencies production
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm ci --omit=dev

# Stage 2: Image production
FROM node:20-alpine
WORKDIR /app

# tini làm init process thay thế (tuỳ chọn — docker-entrypoint.sh dùng exec nên không bắt buộc)
# RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Cấp quyền thực thi cho entrypoint
RUN chmod +x docker-entrypoint.sh

# Chạy dưới user non-root để giảm attack surface
USER node

# Readiness probe dùng /ready (kiểm DB), liveness dùng /health (không đụng DB).
# PORT lấy từ biến môi trường, mặc định 3000.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/ready" || exit 1

EXPOSE 3000

# exec trong entrypoint đảm bảo node là PID 1
ENTRYPOINT ["./docker-entrypoint.sh"]
