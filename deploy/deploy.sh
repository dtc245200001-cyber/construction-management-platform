#!/bin/bash

# ==============================================================================
# SCRIPT DEPLOY BLUE/GREEN DÀNH CHO STAGING SERVER
# ==============================================================================

set -e

if [ -z "$1" ]; then
  echo "Lỗi: Thiếu tham số IMAGE."
  exit 1
fi

IMAGE=$1
CONTAINER_OLD="construction_backend_staging"
CONTAINER_NEW="construction_backend_staging_new"
NETWORK="deploy_default"

echo "[1/5] Pull image mới: $IMAGE"
if [ -n "$GHCR_PAT" ]; then
  echo "$GHCR_PAT" | docker login ghcr.io -u "${GHCR_USER:-github}" --password-stdin
fi
docker pull "$IMAGE"

echo "[2/5] Lấy thông tin network của container cũ..."
if docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER_OLD}\$"; then
  NETWORK=$(docker inspect "$CONTAINER_OLD" -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -n 1)
fi
echo "Network: $NETWORK"

echo "[3/5] Chạy Migration DB..."
if ! docker run --rm --network "$NETWORK" --env-file .env.staging "$IMAGE" npm run migrate:up; then
  echo ">>> MIGRATION THẤT BẠI. Dừng deploy. Hệ thống vẫn dùng container cũ không bị ảnh hưởng."
  exit 1
fi

echo "[4/5] Khởi động container MỚI ($CONTAINER_NEW)..."
docker run -d \
  --name "$CONTAINER_NEW" \
  --network "$NETWORK" \
  --env-file .env.staging \
  "$IMAGE"

echo "Chờ healthcheck của container mới (cần /ready thành công)..."
TIMEOUT=60
PASSED=false

for i in $(seq 1 $TIMEOUT); do
  # Lấy IP của container mới trong network
  NEW_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTAINER_NEW")
  
  if curl -s -f "http://$NEW_IP:3000/ready" >/dev/null; then
    PASSED=true
    echo "-> Container mới đã SẴN SÀNG."
    break
  fi
  sleep 1
done

if [ "$PASSED" = true ]; then
  echo "[5/5] Cập nhật Nginx upstream để chuyển traffic..."
  
  # Cập nhật nginx (giả sử có container nginx tên construction_nginx)
  # Chúng ta reload nginx để nó nhận container mới
  # Trong trường hợp dùng docker-compose, nginx sẽ trỏ tới $CONTAINER_NEW
  docker exec construction_nginx /bin/sh -c "echo \"upstream backend { server $NEW_IP:3000; }\" > /etc/nginx/conf.d/upstream.conf && nginx -s reload" || true
  
  echo "-> Dừng và xóa container cũ ($CONTAINER_OLD)..."
  docker stop "$CONTAINER_OLD" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_OLD" >/dev/null 2>&1 || true
  
  echo "-> Đổi tên container mới thành $CONTAINER_OLD..."
  docker rename "$CONTAINER_NEW" "$CONTAINER_OLD"
  
  echo ">>> DEPLOY THÀNH CÔNG!"
else
  echo ">>> HEALTHCHECK FAIL: Rollback..."
  docker logs --tail 20 "$CONTAINER_NEW" || true
  docker stop "$CONTAINER_NEW" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NEW" >/dev/null 2>&1 || true
  echo ">>> DEPLOY THẤT BẠI. Đã rollback, hệ thống cũ vẫn chạy."
  exit 1
fi
