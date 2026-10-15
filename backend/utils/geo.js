/**
 * Công cụ tính toán toạ độ và đánh giá geofence (Story S-41 / T-107 & T-108)
 * Sử dụng công thức Haversine thuần túy, không dùng thư viện ngoài.
 */

// Bán kính Trái Đất quy ước: 6.371.000 mét (6371 km)
const EARTH_RADIUS_METERS = 6371000;

// Giới hạn sai số GPS của thiết bị di động
const GEOFENCE_MIN_TOLERANCE_M = 30; // Dung sai tối thiểu (mét)
const GEOFENCE_MAX_TOLERANCE_M = 500; // Dung sai tối đa (mét)

/**
 * Chuyển độ (degree) sang radian
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Tính khoảng cách bề mặt giữa 2 toạ độ GPS bằng công thức Haversine (mét)
 * @param {number} lat1 - Vĩ độ điểm 1
 * @param {number} lon1 - Kinh độ điểm 1
 * @param {number} lat2 - Vĩ độ điểm 2
 * @param {number} lon2 - Kinh độ điểm 2
 * @returns {number} Khoảng cách tính bằng mét
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(Number(lat1));
  const phi2 = toRadians(Number(lat2));
  const deltaPhi = toRadians(Number(lat2) - Number(lat1));
  const deltaLambda = toRadians(Number(lon2) - Number(lon1));

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  // Giới hạn a trong khoảng [0, 1] để tránh lỗi làm tròn số thực
  const safeA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Đánh giá vị trí ảnh so với phạm vi (geofence) của công trường
 *
 * Ngưỡng chấp nhận: threshold_m = radius_m + tolerance_m
 * Trong đó tolerance_m = Math.min(500, Math.max(30, accuracy_m || 0))
 *
 * @param {Object} params
 * @param {Object} [params.photo] - Toạ độ ảnh: { latitude|gps_latitude, longitude|gps_longitude, accuracy_m|gps_accuracy_m }
 * @param {Object} [params.site] - Cấu hình công trường: { latitude|site_latitude, longitude|site_longitude, radius_m|site_radius_m }
 * @returns {{
 *   status: 'inside' | 'outside' | 'no_gps' | 'no_site_config',
 *   distance_m: number | null,
 *   threshold_m: number | null,
 *   tolerance_m: number | null,
 *   checked_at: string
 * }}
 */
function evaluateGeofence({ photo, site } = {}) {
  const checked_at = new Date().toISOString();

  // 1. Kiểm tra cấu hình công trường
  const siteLat = site?.latitude ?? site?.site_latitude;
  const siteLon = site?.longitude ?? site?.site_longitude;
  const siteRadius = site?.radius_m ?? site?.site_radius_m;

  const hasSiteConfig =
    siteLat !== null &&
    siteLat !== undefined &&
    siteLon !== null &&
    siteLon !== undefined &&
    siteRadius !== null &&
    siteRadius !== undefined &&
    !Number.isNaN(Number(siteLat)) &&
    !Number.isNaN(Number(siteLon)) &&
    !Number.isNaN(Number(siteRadius)) &&
    Number(siteRadius) > 0;

  if (!hasSiteConfig) {
    return {
      status: 'no_site_config',
      distance_m: null,
      threshold_m: null,
      tolerance_m: null,
      checked_at,
    };
  }

  // 2. Kiểm tra toạ độ ảnh
  const photoLat = photo?.latitude ?? photo?.gps_latitude;
  const photoLon = photo?.longitude ?? photo?.gps_longitude;
  const photoAcc = photo?.accuracy_m ?? photo?.gps_accuracy_m;

  const hasPhotoGps =
    photoLat !== null &&
    photoLat !== undefined &&
    photoLon !== null &&
    photoLon !== undefined &&
    !Number.isNaN(Number(photoLat)) &&
    !Number.isNaN(Number(photoLon));

  if (!hasPhotoGps) {
    return {
      status: 'no_gps',
      distance_m: null,
      threshold_m: null,
      tolerance_m: null,
      checked_at,
    };
  }

  // 3. Tính khoảng cách
  const rawDistance = haversineMeters(photoLat, photoLon, siteLat, siteLon);
  const distance_m = Math.round(rawDistance * 10) / 10; // Làm tròn 1 chữ số thập phân

  // 4. Tính dung sai định vị
  const parsedAcc = Number(photoAcc);
  const rawTolerance = Number.isFinite(parsedAcc) && parsedAcc > 0 ? parsedAcc : 0;
  const tolerance_m = Math.min(
    GEOFENCE_MAX_TOLERANCE_M,
    Math.max(GEOFENCE_MIN_TOLERANCE_M, rawTolerance)
  );

  // 5. Ngưỡng chấp nhận
  const threshold_m = Math.round((Number(siteRadius) + tolerance_m) * 10) / 10;

  // 6. Đánh giá trạng thái: khoảng cách <= ngưỡng là 'inside', lớn hơn là 'outside'
  const status = distance_m <= threshold_m ? 'inside' : 'outside';

  return {
    status,
    distance_m,
    threshold_m,
    tolerance_m,
    checked_at,
  };
}

module.exports = {
  EARTH_RADIUS_METERS,
  GEOFENCE_MIN_TOLERANCE_M,
  GEOFENCE_MAX_TOLERANCE_M,
  haversineMeters,
  evaluateGeofence,
};
