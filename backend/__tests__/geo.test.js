const {
  haversineMeters,
  evaluateGeofence,
} = require('../utils/geo');

describe('Geo utility & Haversine formula (Story S-41 / T-107 & T-108)', () => {
  const SITE_HP = {
    latitude: 20.845,
    longitude: 106.688,
    radius_m: 100,
  };

  test('Khoảng cách giữa hai điểm trùng nhau phải bằng 0', () => {
    const dist = haversineMeters(20.845, 106.688, 20.845, 106.688);
    expect(dist).toBeCloseTo(0, 5);
  });

  test('Tính đối xứng: dist(A, B) === dist(B, A)', () => {
    const d1 = haversineMeters(20.845, 106.688, 21.028511, 105.804817);
    const d2 = haversineMeters(21.028511, 105.804817, 20.845, 106.688);
    expect(d1).toBeCloseTo(d2, 6);
  });

  test('Khoảng cách từ Hải Phòng tới Hà Nội (~94 km)', () => {
    const dist = haversineMeters(20.845, 106.688, 21.028511, 105.804817);
    expect(dist).toBeGreaterThan(90000);
    expect(dist).toBeLessThan(98000);
  });

  test('Khoảng cách dịch chuyển vĩ độ (~111.19m mỗi 0.001 độ)', () => {
    // 0.001 độ vĩ tuyến ~ 111.19 m
    const dist = haversineMeters(20.845, 106.688, 20.846, 106.688);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  describe('Đánh giá evaluateGeofence', () => {
    test('Ảnh ngay tại tâm -> inside, distance_m = 0, threshold_m = 130', () => {
      const res = evaluateGeofence({
        photo: { latitude: 20.845, longitude: 106.688, accuracy_m: 0 },
        site: SITE_HP,
      });

      expect(res.status).toBe('inside');
      expect(res.distance_m).toBe(0);
      expect(res.tolerance_m).toBe(30); // Min tolerance clamp
      expect(res.threshold_m).toBe(130);
    });

    test('Ảnh ở 89m (trong bán kính 100m) -> inside', () => {
      const res = evaluateGeofence({
        photo: { latitude: 20.8458, longitude: 106.688, accuracy_m: 10 },
        site: SITE_HP,
      });

      expect(res.status).toBe('inside');
      expect(res.distance_m).toBeCloseTo(89.0, 1);
      expect(res.tolerance_m).toBe(30); // 10 < 30 -> clamp 30
      expect(res.threshold_m).toBe(130);
    });

    test('Ảnh ở 122.3m (ngoài 100m nhưng trong ngưỡng dung sai 130m) -> inside', () => {
      const res = evaluateGeofence({
        photo: { latitude: 20.8461, longitude: 106.688, accuracy_m: null },
        site: SITE_HP,
      });

      expect(res.status).toBe('inside');
      expect(res.distance_m).toBeCloseTo(122.3, 1);
      expect(res.tolerance_m).toBe(30);
      expect(res.threshold_m).toBe(130);
    });

    test('Ảnh ở 133.4m (ngoài ngưỡng 130m) với dung sai mặc định -> outside', () => {
      const res = evaluateGeofence({
        photo: { latitude: 20.8462, longitude: 106.688, accuracy_m: 0 },
        site: SITE_HP,
      });

      expect(res.status).toBe('outside');
      expect(res.distance_m).toBeCloseTo(133.4, 1);
      expect(res.threshold_m).toBe(130);
    });

    test('Ảnh ở 133.4m nhưng accuracy = 50m -> threshold 150m -> inside', () => {
      const res = evaluateGeofence({
        photo: { latitude: 20.8462, longitude: 106.688, accuracy_m: 50 },
        site: SITE_HP,
      });

      expect(res.status).toBe('inside');
      expect(res.tolerance_m).toBe(50);
      expect(res.threshold_m).toBe(150);
      expect(res.distance_m).toBeCloseTo(133.4, 1);
    });

    test('Ảnh có accuracy cực lớn 1000m -> clamp dung sai tối đa 500m', () => {
      const res = evaluateGeofence({
        photo: { latitude: 20.8462, longitude: 106.688, accuracy_m: 1000 },
        site: SITE_HP,
      });

      expect(res.tolerance_m).toBe(500);
      expect(res.threshold_m).toBe(600); // 100 + 500
      expect(res.status).toBe('inside');
    });

    test('Ảnh tại Hà Nội cách Hải Phòng ~94km -> outside', () => {
      const res = evaluateGeofence({
        photo: { latitude: 21.028511, longitude: 105.804817 },
        site: SITE_HP,
      });

      expect(res.status).toBe('outside');
      expect(res.distance_m).toBeGreaterThan(90000);
    });

    test('Hỗ trợ cả tên trường theo database: gps_latitude và site_latitude', () => {
      const res = evaluateGeofence({
        photo: { gps_latitude: 20.845, gps_longitude: 106.688, gps_accuracy_m: 40 },
        site: { site_latitude: 20.845, site_longitude: 106.688, site_radius_m: 200 },
      });

      expect(res.status).toBe('inside');
      expect(res.distance_m).toBe(0);
      expect(res.tolerance_m).toBe(40);
      expect(res.threshold_m).toBe(240);
    });

    test('Ảnh không có toạ độ GPS -> no_gps', () => {
      const r1 = evaluateGeofence({
        photo: { latitude: null, longitude: null },
        site: SITE_HP,
      });
      expect(r1.status).toBe('no_gps');
      expect(r1.distance_m).toBeNull();

      const r2 = evaluateGeofence({
        photo: null,
        site: SITE_HP,
      });
      expect(r2.status).toBe('no_gps');
    });

    test('Dự án chưa cấu hình phạm vi -> no_site_config', () => {
      const r1 = evaluateGeofence({
        photo: { latitude: 20.845, longitude: 106.688 },
        site: null,
      });
      expect(r1.status).toBe('no_site_config');
      expect(r1.distance_m).toBeNull();
      expect(r1.basis).toBeNull();

      const r2 = evaluateGeofence({
        photo: { latitude: 20.845, longitude: 106.688 },
        site: { site_latitude: 20.845, site_longitude: 106.688, site_radius_m: 0 },
      });
      expect(r2.status).toBe('no_site_config');

      const r3 = evaluateGeofence({
        photo: { latitude: 20.845, longitude: 106.688 },
        site: { site_latitude: null, site_longitude: null, site_radius_m: null },
      });
      expect(r3.status).toBe('no_site_config');
    });

    test('Hardening S-41: Client reported cố định dung sai 30m, BỎ QUA accuracy_m = 500', () => {
      // Bán kính site = 100m. Khoảng cách = 140m.
      // Nếu tin accuracy 500m -> threshold = 600m -> inside (SAI / lỗ hổng)
      // Khi cố định 30m -> threshold = 130m -> outside (ĐÚNG)
      const res = evaluateGeofence({
        photo: {
          latitude: 20.84626, // cách 20.845 khoảng 140m
          longitude: 106.688,
          accuracy_m: 500,
          gps_source: 'client_reported',
        },
        site: SITE_HP,
      });

      expect(res.basis).toBe('client_reported');
      expect(res.tolerance_m).toBe(30);
      expect(res.threshold_m).toBe(130);
      expect(res.status).toBe('outside');
    });

    test('Hardening S-41: File EXIF áp dụng accuracy lấy từ EXIF kẹp [30m, 500m]', () => {
      const res = evaluateGeofence({
        photo: {
          latitude: 20.845,
          longitude: 106.688,
          accuracy_m: 80,
          gps_source: 'file_exif',
        },
        site: SITE_HP,
      });

      expect(res.basis).toBe('file_exif');
      expect(res.tolerance_m).toBe(80);
      expect(res.threshold_m).toBe(180);
      expect(res.status).toBe('inside');
    });
  });
});
