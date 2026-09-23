#!/bin/bash

# ==============================================================================
# SCRIPT DEPLOY BLUE/GREEN DÀNH CHO STAGING SERVER
# 
# KỊCH BẢN ROLLBACK & ZERO-DOWNTIME (NFR):
# - Team mình chưa dùng kịch bản này bao giờ nên lưu ý: Nếu ta xóa container 
#   đang chạy (cũ) rồi mới start container mới, nếu image mới lỗi hoặc crash,
#   hệ thống sẽ sập (downtime).
# - Logic ở đây là: 
#   1. Kéo image mới về.
#   2. Khởi động nó song song dưới tên tạm (vd: backend_new).
#   3. Đợi container mới tự test sức khỏe (chờ báo healthy).
#   4. Nếu lỗi -> Xóa container mới, thoát với exit code 1. Container cũ vẫn 
#      đang chạy bình thường -> KHÔNG AI BỊ ẢNH HƯỞNG.
#   5. Nếu thành công -> Xóa container cũ, rename container mới thành tên chuẩn.
# ==============================================================================

set -e

if [ -z "$1" ]; then
  echo "Lỗi: Thiếu tham số IMAGE. Cách dùng: ./deploy.sh ghcr.io/<org>/<repo>-backend:latest"
  exit 1
fi

IMAGE=$1
CONTAINER_OLD="construction_backend_staging"
CONTAINER_NEW="construction_backend_staging_new"

echo "[1/4] Pull image mới: $IMAGE"
docker pull "$IMAGE"

echo "[2/4] Lấy thông tin network của container cũ (để nối vào cùng DB)..."
NETWORK="deploy_default"
if docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER_OLD}\$"; then
  # Lấy network thật đang gắn với container cũ
  NETWORK=$(docker inspect "$CONTAINER_OLD" -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -n 1)
  echo "-> Container cũ đang chạy trên network: $NETWORK"
else
  echo "-> Không tìm thấy container cũ. Sẽ dùng network mặc định: $NETWORK"
fi

echo "[3/4] Khởi động container MỚI ($CONTAINER_NEW) trên port nội bộ khác..."
# Chạy container mới:
# - Dùng file .env.staging để đọc biến môi trường
# - Tạm publish ra host port khác (vd 3001) để không đụng port 3000 đang chạy
docker run -d \
  --name "$CONTAINER_NEW" \
  --network "$NETWORK" \
  --env-file .env.staging \
  -p 3001:3000 \
  "$IMAGE"

echo "[4/4] Chờ healthcheck của container mới (Timeout: 60s)..."
TIMEOUT=60
PASSED=false

for i in $(seq 1 $TIMEOUT); do
  # Đọc trạng thái health từ docker inspect
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NEW" 2>/dev/null || echo "unknown")
  
  if [ "$HEALTH" = "healthy" ]; then
    PASSED=true
    echo "-> [Giây $i] Container mới đã SẴN SÀNG (healthy)."
    break
  elif [ "$HEALTH" = "unhealthy" ]; then
    echo "-> [Giây $i] Container mới báo LỖI (unhealthy)!"
    break
  fi
  sleep 1
done

if [ "$PASSED" = true ]; then
  echo ">>> HEALTHCHECK PASS: Bắt đầu chuyển đổi traffic..."
  
  echo "-> Dừng và xóa container cũ ($CONTAINER_OLD)..."
  docker stop "$CONTAINER_OLD" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_OLD" >/dev/null 2>&1 || true
  
  echo "-> Đổi tên container mới thành $CONTAINER_OLD..."
  docker rename "$CONTAINER_NEW" "$CONTAINER_OLD"
  
  # GHI CHÚ QUAN TRỌNG CHO TEAM: 
  # Do Docker không hỗ trợ thay đổi host-port mapping (3001 -> 3000) on-the-fly,
  # nên ở task này container mới vẫn đang hở port 3001. Để thực sự zero-downtime 
  # chuẩn xác trên port 80/443, ta bắt buộc phải dùng NGINX Reverse Proxy ở Task sau.
  # (Lúc đó Nginx sẽ reload config để trỏ upstream sang IP của backend_new).
  
  echo ">>> DEPLOY THÀNH CÔNG!"
else
  echo ">>> HEALTHCHECK FAIL: Bắt đầu Rollback..."
  
  echo "-> Log của container lỗi để debug:"
  docker logs --tail 20 "$CONTAINER_NEW" || true
  
  echo "-> Dừng và xóa container lỗi ($CONTAINER_NEW)..."
  docker stop "$CONTAINER_NEW" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NEW" >/dev/null 2>&1 || true
  
  echo ">>> DEPLOY THẤT BẠI. Đã rollback, hệ thống vẫn đang chạy phiên bản cũ (an toàn)."
  exit 1
fi
