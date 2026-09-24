#!/bin/sh
# docker-entrypoint.sh — Entrypoint container backend.
#
# Chạy migration rồi dùng exec để node trở thành PID 1, nhận SIGTERM trực tiếp
# từ Docker thay vì qua sh (sh không forward tín hiệu → docker stop phải chờ 10s rồi SIGKILL).

set -e

echo "Đang chạy migration cơ sở dữ liệu..."
node -r dotenv/config ./node_modules/node-pg-migrate/bin/node-pg-migrate up

echo "Migration hoàn thành. Khởi động server..."
exec node server.js
