#!/bin/bash
set -e

echo "=== START DEPLOY ==="

# 1. Check if git working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "Lỗi: Working directory không clean. Vui lòng commit hoặc stash thay đổi trước khi deploy."
  exit 1
fi

echo "-> Git working directory clean."

# 2. Wait for Postgres
echo "-> Chờ database Postgres sẵn sàng..."
while ! pg_isready -h localhost -p 5432 -U postgres -q; do
  echo "Đang chờ Postgres..."
  sleep 2
done
echo "-> Postgres đã sẵn sàng."

# 3. Pull latest code (giả định dùng git pull)
echo "-> Kéo code mới..."
git pull origin main || echo "Bo qua git pull de test"

# 4. Cập nhật dependencies và chạy Migration cho backend
echo "-> Cài đặt backend dependencies..."
cd backend
npm install
echo "-> Chạy database migrations..."
npm run migrate || npx node-pg-migrate up
cd ..

# 5. Build frontend
echo "-> Build frontend..."
cd frontend
npm install
npm run build
cd ..

# 6. Restart PM2 (giả định app tên là construction-backend)
echo "-> Khởi động lại PM2..."
pm2 restart construction-backend || pm2 start backend/server.js --name "construction-backend"

echo "=== DEPLOY SUCCESS ==="
