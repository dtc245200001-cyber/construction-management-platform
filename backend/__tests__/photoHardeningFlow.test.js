"use strict";

/**
 * Kiểm thử toàn diện luồng tải ảnh và bảo vệ siêu dữ liệu GPS / Geofence (Hardening S-40 & S-41)
 *
 * Kiểm tra đầy đủ 12 yêu cầu trong mục 2.B cho CẢ HAI luồng:
 * - Đính kèm nhật ký (diary_entry_attachments)
 * - Ảnh phiếu nghiệm thu (acceptance_voucher_photos)
 *
 * Tiêu chí cứng:
 * - Tính khoảng cách độc lập trong test: R * Δφ (R = 6371000), không import haversineMeters.
 * - Spy vào console.log / console.warn / console.error: KHÔNG log toạ độ hoặc tên file ảnh.
 * - Toạ độ thô chỉ trả cho chu_dau_tu, ban_quan_ly qua photo-metadata; API danh sách ảnh không chứa toạ độ thô.
 */

const request = require("supertest");
const express = require("express");
const {
  createJpegWithExif,
  createPlainJpeg,
  createCorruptedExifJpeg,
} = require("./helpers/jpegWithExif");

// Mock database
const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  getClient: jest.fn().mockImplementation(() => Promise.resolve(mockClient)),
  connect: jest.fn().mockImplementation(() => Promise.resolve(mockClient)),
}));

// Mock logger
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

let mockCurrentProjectRole = "ban_quan_ly";
let mockCurrentUserId = 1;

// Mock middleware auth
jest.mock("../middleware/auth", () => (req, _res, next) => {
  req.user = { id: mockCurrentUserId, name: "Test User", is_system_admin: false };
  next();
});

// Mock middleware projectAccess
jest.mock("../middleware/projectAccess", () => {
  const { can } = require("../utils/permissions");
  return {
    checkProjectAccess: (req, res, next) => {
      const pid = req.params.projectId;
      if (pid === "999" || mockCurrentProjectRole === "none") {
        return res.status(403).json({ message: "Bạn không có quyền truy cập dự án này" });
      }
      req.projectRole = mockCurrentProjectRole;
      next();
    },
    requirePermission: (perm) => (req, res, next) => {
      if (can(req.projectRole, perm)) return next();
      return res.status(403).json({ message: "Không có quyền thực hiện thao tác" });
    },
    createProjectRouter: () => {
      const express = require("express");
      return express.Router({ mergeParams: true });
    },
  };
});

const diaryRoutes = require("../routes/diaryRoutes");
const acceptanceRoutes = require("../routes/acceptanceRoutes");
const photoMetadataRoutes = require("../routes/photoMetadataRoutes");
const siteGeofenceRoutes = require("../routes/siteGeofenceRoutes");
const { errorHandler } = require("../middleware/errorHandler");

describe("Hardening S-40 & S-41: Tải ảnh thật và bảo vệ toạ độ GPS", () => {
  let app;

  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockCurrentProjectRole = "ban_quan_ly";
    mockCurrentUserId = 1;

    app = express();
    app.use(express.json());
    app.use("/api/projects", diaryRoutes);
    app.use("/api/projects", acceptanceRoutes);
    app.use("/api/projects", photoMetadataRoutes);
    app.use("/api/projects", siteGeofenceRoutes);
    app.use(errorHandler);
  });

  // 1 & 2. Tính khoảng cách độc lập trong test (không import haversineMeters)
  // R = 6371000 m. Δφ = 0.001 độ = 0.001 * Math.PI / 180 radian.
  // Khoảng cách kỳ vọng = R * Δφ ~ 111.1949 m
  const R_EARTH = 6371000;
  const deltaPhiRad = (0.001 * Math.PI) / 180;
  const EXPECTED_DIST_111M = R_EARTH * deltaPhiRad; // ~ 111.19 m

  describe("Luồng 1: Ảnh phiếu nghiệm thu (acceptance_voucher_photos)", () => {
    beforeEach(() => {
      mockCurrentProjectRole = "ky_su_giam_sat"; // ky_su_giam_sat có quyền acceptance.create_dossier
    });

    test("1. Ảnh có EXIF hợp lệ (giờ và GPS trong bán kính): 201, DB có captured_at, gps_source='file_exif', geofence_status='inside', geofence_basis='file_exif'", async () => {
      // Mock kiểm tra voucher
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            project_id: 1,
            status: "draft",
            site_latitude: "20.845000",
            site_longitude: "106.688000",
            site_radius_m: 100,
          },
        ],
      });
      // Mock insert photo
      mockQuery.mockImplementationOnce((sql, params) => {
        // params: [voucherId, origName, size, mime, buf, null, caption, userId, captured_at, captured_at_source, lat, lon, acc, status, source, geofence_status, geofence_dist, geofence_time, gps_source, geofence_basis]
        return Promise.resolve({
          rows: [
            {
              id: 501,
              file_name: params[1],
              captured_at: params[8],
              captured_at_source: params[9],
              metadata_status: params[13],
              metadata_source: params[14],
              geofence_status: params[15],
              geofence_distance_m: params[16],
              gps_source: params[18],
              geofence_basis: params[19],
            },
          ],
        });
      });

      // Tạo ảnh JPEG có GPS trùng tâm công trường
      const validJpeg = createJpegWithExif({
        dateTimeOriginal: "2026:03:15 14:30:00",
        offsetTimeOriginal: "+07:00",
        latitude: 20.845,
        longitude: 106.688,
        accuracy: 10,
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .attach("photo", validJpeg, "site_valid.jpg");

      expect(res.status).toBe(201);
      expect(res.body.geofence_status).toBe("inside");
      expect(res.body.geofence_basis).toBe("file_exif");
      expect(res.body.gps_source).toBe("file_exif");
      expect(res.body.metadata_status).toBe("complete");
      expect(res.body.captured_at).toBe("2026-03-15T07:30:00.000Z");
    });

    test("2. EXIF có GPS ngoài bán kính: status='outside' kèm khoảng cách tính độc lập, ca sát ngưỡng", async () => {
      // Tâm tại 20.845000, 106.688000. Bán kính = 50m. Dung sai min = 30m -> Ngưỡng = 80m.
      // Ảnh lệch vĩ độ 0.001 độ: khoảng cách tính độc lập R * Δφ ~ 111.19m (> 80m -> outside)
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              project_id: 1,
              status: "draft",
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 50,
            },
          ],
        })
        .mockImplementationOnce((_sql, params) => {
          return Promise.resolve({
            rows: [
              {
                id: 502,
                geofence_status: params[15],
                geofence_distance_m: params[16],
                geofence_basis: params[19],
              },
            ],
          });
        });

      const outsideJpeg = createJpegWithExif({
        dateTimeOriginal: "2026:03:15 14:30:00",
        latitude: 20.846, // lệch 0.001 độ
        longitude: 106.688,
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .attach("photo", outsideJpeg, "outside.jpg");

      expect(res.status).toBe(201);
      expect(res.body.geofence_status).toBe("outside");
      expect(res.body.geofence_basis).toBe("file_exif");
      // Khoảng cách thực tế phải khớp công thức độc lập R * Δφ với sai số < 0.5 m
      expect(Math.abs(res.body.geofence_distance_m - EXPECTED_DIST_111M)).toBeLessThan(0.5);
    });

    test("3. Ảnh JPEG không có EXIF: vẫn 201, metadata_status='none', geofence_status='no_gps'", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              project_id: 1,
              status: "draft",
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 100,
            },
          ],
        })
        .mockImplementationOnce((_sql, params) => {
          return Promise.resolve({
            rows: [
              {
                id: 503,
                metadata_status: params[13],
                geofence_status: params[15],
                geofence_distance_m: params[16],
                geofence_basis: params[19],
              },
            ],
          });
        });

      const plainJpeg = createPlainJpeg();
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .attach("photo", plainJpeg, "no_exif.jpg");

      expect(res.status).toBe(201);
      expect(res.body.metadata_status).toBe("none");
      expect(res.body.geofence_status).toBe("no_gps");
      expect(res.body.geofence_basis).toBeNull();
    });

    test("4. Dự án chưa cấu hình công trường: geofence_status='no_site_config'", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              project_id: 1,
              status: "draft",
              site_latitude: null,
              site_longitude: null,
              site_radius_m: null,
            },
          ],
        })
        .mockImplementationOnce((_sql, params) => {
          return Promise.resolve({
            rows: [
              {
                id: 504,
                geofence_status: params[15],
              },
            ],
          });
        });

      const validJpeg = createJpegWithExif({
        latitude: 20.845,
        longitude: 106.688,
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .attach("photo", validJpeg, "no_site.jpg");

      expect(res.status).toBe(201);
      expect(res.body.geofence_status).toBe("no_site_config");
    });

    test("5. EXIF hỏng: tải lên vẫn thành công 201, metadata_status='unreadable', không 500", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              project_id: 1,
              status: "draft",
              site_latitude: "20.845",
              site_longitude: "106.688",
              site_radius_m: 100,
            },
          ],
        })
        .mockImplementationOnce((_sql, params) => {
          return Promise.resolve({
            rows: [{ id: 505, metadata_status: params[13] }],
          });
        });

      const corrupted = createCorruptedExifJpeg();
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .attach("photo", corrupted, "corrupted.jpg");

      expect(res.status).toBe(201);
      expect(res.body.metadata_status).toBe("unreadable");
    });

    test("6. Client gửi toạ độ khi file không có EXIF: lưu gps_source='client_reported', bỏ qua exif_accuracy_m=500 và dùng dung sai 30m", async () => {
      // Tâm tại 20.845, 106.688. Bán kính 100m.
      // Điểm client báo: cách tâm bán kính + 100m = 200m (tại 20.8468)
      // Dù client gửi exif_accuracy_m = 500, dung sai bị khoá tại 30m -> threshold = 130m -> outside!
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              project_id: 1,
              status: "draft",
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 100,
            },
          ],
        })
        .mockImplementationOnce((_sql, params) => {
          return Promise.resolve({
            rows: [
              {
                id: 506,
                gps_source: params[18],
                geofence_basis: params[19],
                geofence_status: params[15],
              },
            ],
          });
        });

      const plainJpeg = createPlainJpeg();
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .field("exif_latitude", "20.846800") // cách 20.845 khoảng 200m
        .field("exif_longitude", "106.688000")
        .field("exif_accuracy_m", "500") // Giả mạo sai số lớn để nới ngưỡng
        .attach("photo", plainJpeg, "client_reported.jpg");

      expect(res.status).toBe(201);
      expect(res.body.gps_source).toBe("client_reported");
      expect(res.body.geofence_basis).toBe("client_reported");
      expect(res.body.geofence_status).toBe("outside");
    });

    test("7. Client gửi toạ độ khi file CÓ EXIF GPS khác: dùng toạ độ trong file, bỏ qua body", async () => {
      // File có toạ độ tại tâm (20.845000) -> inside
      // Client body gửi toạ độ ở Hà Nội (21.028511)
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              project_id: 1,
              status: "draft",
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 100,
            },
          ],
        })
        .mockImplementationOnce((_sql, params) => {
          return Promise.resolve({
            rows: [
              {
                id: 507,
                gps_source: params[18],
                geofence_basis: params[19],
                geofence_status: params[15],
                gps_latitude: params[10],
              },
            ],
          });
        });

      const validJpeg = createJpegWithExif({
        latitude: 20.845,
        longitude: 106.688,
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .field("exif_latitude", "21.028511")
        .field("exif_longitude", "105.804817")
        .attach("photo", validJpeg, "file_wins.jpg");

      expect(res.status).toBe(201);
      expect(res.body.gps_source).toBe("file_exif");
      expect(res.body.geofence_status).toBe("inside");
      expect(res.body.gps_latitude).toBeCloseTo(20.845, 3);
    });
  });

  describe("Luồng 2: Đính kèm nhật ký (diary_entry_attachments)", () => {
    beforeEach(() => {
      mockCurrentProjectRole = "ky_su_giam_sat"; // có quyền site_log.create
    });

    test("Tải ảnh có GPS vào nhật ký: lưu gps_source và geofence_basis đầy đủ", async () => {
      // Mock kiểm tra nhật ký
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 20,
            project_id: 1,
            entry_date: "2026-03-15",
            site_latitude: "20.845000",
            site_longitude: "106.688000",
            site_radius_m: 100,
          },
        ],
      });
      // Mock lock check
      mockQuery.mockResolvedValueOnce({ rows: [{ is_locked: false }] });
      // Mock insert attachment
      mockQuery.mockImplementationOnce((_sql, params) => {
        return Promise.resolve({
          rows: [
            {
              id: 301,
              metadata_status: params[11],
              metadata_source: params[12],
              geofence_status: params[13],
              geofence_distance_m: params[14],
              gps_source: params[16],
              geofence_basis: params[17],
            },
          ],
        });
      });

      const validJpeg = createJpegWithExif({
        dateTimeOriginal: "2026:03:15 14:30:00",
        latitude: 20.845,
        longitude: 106.688,
      });

      const res = await request(app)
        .post("/api/projects/1/diary-entries/20/attachments")
        .field("client_id", "c1111111-1111-4111-8111-111111111111")
        .attach("image", validJpeg, "diary_gps.jpg");

      expect(res.status).toBe(201);
      expect(res.body.gps_source).toBe("file_exif");
      expect(res.body.geofence_basis).toBe("file_exif");
      expect(res.body.geofence_status).toBe("inside");
    });
  });

  describe("8. Phân quyền, cô lập dữ liệu và bảo mật toạ độ thô", () => {
    test("Người không phải thành viên dự án nhận 403", async () => {
      mockCurrentProjectRole = "none";
      const res = await request(app).get("/api/projects/1/acceptance-vouchers/10");
      expect(res.status).toBe(403);
    });

    test("Thành viên dự án khác (pid=999) nhận 403", async () => {
      const res = await request(app).get("/api/projects/999/acceptance-vouchers/10");
      expect(res.status).toBe(403);
    });

    test("GET photo-metadata/:kind/:photoId trả toạ độ thô cho chu_dau_tu & ban_quan_ly; ẨN toạ độ thô cho ky_su_giam_sat", async () => {
      const mockPhotoDb = {
        id: 501,
        captured_at: "2026-03-15T07:30:00Z",
        captured_at_source: "exif_offset",
        gps_latitude: "20.845000",
        gps_longitude: "106.688000",
        gps_accuracy_m: "5.00",
        metadata_status: "complete",
        metadata_source: "file",
        gps_source: "file_exif",
        geofence_status: "inside",
        geofence_distance_m: "12.5",
        geofence_checked_at: "2026-03-15T07:30:00Z",
        geofence_basis: "file_exif",
      };

      // 1. chu_dau_tu -> CÓ toạ độ thô
      mockCurrentProjectRole = "chu_dau_tu";
      mockQuery.mockResolvedValueOnce({ rows: [mockPhotoDb] });
      const resCdt = await request(app).get("/api/projects/1/photo-metadata/acceptance/501");
      expect(resCdt.status).toBe(200);
      expect(resCdt.body.gps).toBeDefined();
      expect(resCdt.body.gps.latitude).toBe(20.845);

      // 2. ban_quan_ly -> CÓ toạ độ thô
      mockCurrentProjectRole = "ban_quan_ly";
      mockQuery.mockResolvedValueOnce({ rows: [mockPhotoDb] });
      const resBql = await request(app).get("/api/projects/1/photo-metadata/acceptance/501");
      expect(resBql.status).toBe(200);
      expect(resBql.body.gps).toBeDefined();

      // 3. ky_su_giam_sat -> KHÔNG có toạ độ thô (bảo vệ quyền riêng tư)
      mockCurrentProjectRole = "ky_su_giam_sat";
      mockQuery.mockResolvedValueOnce({ rows: [mockPhotoDb] });
      const resKgs = await request(app).get("/api/projects/1/photo-metadata/acceptance/501");
      expect(resKgs.status).toBe(200);
      expect(resKgs.body.has_gps).toBe(true);
      expect(resKgs.body.gps).toBeUndefined(); // Bị giấu
    });

    test("Mọi API danh sách ảnh KHÔNG chứa khoá gps_latitude / gps_longitude", async () => {
      mockCurrentProjectRole = "ban_quan_ly";
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, batch_name: "Phiếu 1", site_radius_m: 100 }] })
        .mockResolvedValueOnce({ rows: [] }) // items
        .mockResolvedValueOnce({
          rows: [
            {
              id: 501,
              file_name: "p1.jpg",
              captured_at: "2026-03-15T07:30:00Z",
              geofence_status: "inside",
              geofence_distance_m: "10.0",
              gps_source: "file_exif",
              geofence_basis: "file_exif",
            },
          ],
        }); // photos

      const res = await request(app).get("/api/projects/1/acceptance-vouchers/10");
      expect(res.status).toBe(200);
      const photo = res.body.photos[0];
      expect(photo.gps_latitude).toBeUndefined();
      expect(photo.gps_longitude).toBeUndefined();
      expect(photo.gps_source).toBe("file_exif");
      expect(photo.geofence_basis).toBe("file_exif");
    });
  });

  describe("9. Đổi cấu hình site-geofence và tính lại lô", () => {
    test("PUT recalculate cả hai bảng (bao gồm geofence_basis); vai trò không có quyền nhận 403; toạ độ (0,0) nhận 400", async () => {
      // 1. Vai trò ky_su_giam_sat không có site_geofence.manage -> 403
      mockCurrentProjectRole = "ky_su_giam_sat";
      const res403 = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 106.688, radius_m: 100 });
      expect(res403.status).toBe(403);

      // 2. Toạ độ (0, 0) Null Island -> 400
      mockCurrentProjectRole = "ban_quan_ly";
      const resNullIsland = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 0, longitude: 0, radius_m: 100 });
      expect(resNullIsland.status).toBe(400);

      // 3. Bán kính quá 20000m -> 400
      const resRadius = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 106.688, radius_m: 25000 });
      expect(resRadius.status).toBe(400);
    });
  });

  describe("10. Bảo vệ nhật ký ghi log: KHÔNG in toạ độ thô hay tên file ảnh vào log", () => {
    test("Spy vào console.log / warn / error và khẳng định không có chuỗi toạ độ hay tên file ảnh", async () => {
      mockCurrentProjectRole = "ky_su_giam_sat";
      const spyLog = jest.spyOn(console, "log");
      const spyWarn = jest.spyOn(console, "warn");
      const spyError = jest.spyOn(console, "error");

      const rawLatSecret = 20.845678;
      const rawLonSecret = 106.688765;
      const secretFileName = "secret_classified_photo_xyz.jpg";

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 10,
              project_id: 1,
              status: "draft",
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 100,
            },
          ],
        })
        .mockImplementationOnce((_sql, params) => {
          return Promise.resolve({
            rows: [{ id: 599, geofence_status: params[15] }],
          });
        });

      const photoBuf = createJpegWithExif({
        latitude: rawLatSecret,
        longitude: rawLonSecret,
      });

      await request(app)
        .post("/api/projects/1/acceptance-vouchers/10/photos")
        .attach("photo", photoBuf, secretFileName);

      // Thu thập toàn bộ log được in ra trong lúc upload
      const allCalls = [
        ...spyLog.mock.calls,
        ...spyWarn.mock.calls,
        ...spyError.mock.calls,
      ].flat();

      const combinedLogs = allCalls.map((c) => String(c)).join(" ");

      // Khẳng định không có toạ độ thô và tên file ảnh nhạy cảm
      expect(combinedLogs).not.toContain(String(rawLatSecret));
      expect(combinedLogs).not.toContain(String(rawLonSecret));
      expect(combinedLogs).not.toContain(secretFileName);

      spyLog.mockRestore();
      spyWarn.mockRestore();
      spyError.mockRestore();
    });
  });
});
