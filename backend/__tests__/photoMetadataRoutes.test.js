"use strict";

const request = require("supertest");
const express = require("express");

const mockQuery = jest.fn();

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
}));

let mockCurrentProjectRole = "ky_su_giam_sat";

jest.mock("../middleware/auth", () => (req, res, next) => {
  req.user = { id: 10, email: "tester@test.com" };
  next();
});

jest.mock("../middleware/projectAccess", () => {
  const express = require("express");
  return {
    checkProjectAccess: (req, res, next) => {
      req.projectRole = mockCurrentProjectRole;
      next();
    },
    requirePermission: (perm) => (req, res, next) => {
      const { can } = require("../utils/permissions");
      if (!can(req.projectRole, perm)) {
        return res.status(403).json({ message: "Không có quyền truy cập" });
      }
      next();
    },
    createProjectRouter: () => express.Router({ mergeParams: true }),
  };
});

const photoMetadataRoutes = require("../routes/photoMetadataRoutes");
const { errorHandler } = require("../middleware/errorHandler");

describe("photoMetadataRoutes Unit Tests (S-40 / T-106)", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentProjectRole = "ky_su_giam_sat";

    app = express();
    app.use(express.json());
    app.use("/api/projects", photoMetadataRoutes);
    app.use(errorHandler);
  });

  describe("Quyền riêng tư vị trí GPS và phân quyền vai trò", () => {
    const mockDbPhotoWithGps = {
      id: 101,
      captured_at: "2026-03-15T07:30:00.000Z",
      captured_at_source: "exif_offset",
      gps_latitude: "10.762622",
      gps_longitude: "106.660172",
      gps_accuracy_m: "5.50",
      metadata_status: "complete",
      metadata_source: "file",
    };

    test("Chủ đầu tư (chu_dau_tu) ĐƯỢC XEM toạ độ thô", async () => {
      mockCurrentProjectRole = "chu_dau_tu";
      mockQuery.mockResolvedValueOnce({ rows: [mockDbPhotoWithGps] });

      const res = await request(app).get("/api/projects/1/photo-metadata/diary/101");
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.status).toBe("complete");
      expect(res.body.status_label).toBe("Đầy đủ thời gian và toạ độ");
      expect(res.body.captured_at).toBe("2026-03-15T07:30:00.000Z");
      expect(res.body.has_gps).toBe(true);
      expect(res.body.gps).toEqual({
        latitude: 10.762622,
        longitude: 106.660172,
        accuracy_m: 5.5,
      });
    });

    test("Ban quản lý (ban_quan_ly) ĐƯỢC XEM toạ độ thô", async () => {
      mockCurrentProjectRole = "ban_quan_ly";
      mockQuery.mockResolvedValueOnce({ rows: [mockDbPhotoWithGps] });

      const res = await request(app).get("/api/projects/1/photo-metadata/acceptance/202");
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.has_gps).toBe(true);
      expect(res.body.gps).toBeDefined();
      expect(res.body.gps.latitude).toBe(10.762622);
      expect(res.body.gps.longitude).toBe(106.660172);
    });

    test("Kỹ sư giám sát (ky_su_giam_sat) KHÔNG ĐƯỢC XEM toạ độ thô, chỉ thấy has_gps=true", async () => {
      mockCurrentProjectRole = "ky_su_giam_sat";
      mockQuery.mockResolvedValueOnce({ rows: [mockDbPhotoWithGps] });

      const res = await request(app).get("/api/projects/1/photo-metadata/diary/101");
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.status).toBe("complete");
      expect(res.body.has_gps).toBe(true);
      // Quyền riêng tư: KHÔNG có khoá gps
      expect(res.body.gps).toBeUndefined();
    });

    test("Đội trưởng thi công (doi_truong) KHÔNG ĐƯỢC XEM toạ độ thô", async () => {
      mockCurrentProjectRole = "doi_truong";
      mockQuery.mockResolvedValueOnce({ rows: [mockDbPhotoWithGps] });

      const res = await request(app).get("/api/projects/1/photo-metadata/diary/101");
      expect(res.status).toBe(200);
      expect(res.body.has_gps).toBe(true);
      expect(res.body.gps).toBeUndefined();
    });

    test("Kế toán (ke_toan) KHÔNG ĐƯỢC XEM toạ độ thô", async () => {
      mockCurrentProjectRole = "ke_toan";
      mockQuery.mockResolvedValueOnce({ rows: [mockDbPhotoWithGps] });

      const res = await request(app).get("/api/projects/1/photo-metadata/acceptance/202");
      expect(res.status).toBe(200);
      expect(res.body.has_gps).toBe(true);
      expect(res.body.gps).toBeUndefined();
    });

    test("Chỉ huy trưởng (chi_huy_truong) KHÔNG ĐƯỢC XEM toạ độ thô", async () => {
      mockCurrentProjectRole = "chi_huy_truong";
      mockQuery.mockResolvedValueOnce({ rows: [mockDbPhotoWithGps] });

      const res = await request(app).get("/api/projects/1/photo-metadata/diary/101");
      expect(res.status).toBe(200);
      expect(res.body.has_gps).toBe(true);
      expect(res.body.gps).toBeUndefined();
    });
  });

  describe("Xử lý các trạng thái ảnh khác nhau", () => {
    test("Ảnh không có siêu dữ liệu gốc (status none)", async () => {
      mockCurrentProjectRole = "ban_quan_ly";
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 102,
            captured_at: null,
            captured_at_source: null,
            gps_latitude: null,
            gps_longitude: null,
            gps_accuracy_m: null,
            metadata_status: "none",
            metadata_source: "file",
          },
        ],
      });

      const res = await request(app).get("/api/projects/1/photo-metadata/diary/102");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("none");
      expect(res.body.status_label).toBe("Ảnh không có siêu dữ liệu gốc");
      expect(res.body.captured_at).toBeNull();
      expect(res.body.has_gps).toBe(false);
      expect(res.body.gps).toBeUndefined();
    });

    test("Ảnh chỉ có thời gian (status time_only)", async () => {
      mockCurrentProjectRole = "chu_dau_tu";
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 103,
            captured_at: "2026-03-15T07:30:00.000Z",
            captured_at_source: "assumed_local",
            gps_latitude: null,
            gps_longitude: null,
            gps_accuracy_m: null,
            metadata_status: "time_only",
            metadata_source: "file",
          },
        ],
      });

      const res = await request(app).get("/api/projects/1/photo-metadata/diary/103");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("time_only");
      expect(res.body.status_label).toBe("Chỉ có thời gian chụp");
      expect(res.body.captured_at).toBe("2026-03-15T07:30:00.000Z");
      expect(res.body.has_gps).toBe(false);
      expect(res.body.gps).toBeUndefined();
    });
  });

  describe("Validation & Lỗi", () => {
    test("kind không hợp lệ -> 400", async () => {
      const res = await request(app).get("/api/projects/1/photo-metadata/invalid_kind/101");
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Chỉ chấp nhận 'diary' hoặc 'acceptance'");
    });

    test("projectId hoặc photoId không phải số dương -> 400", async () => {
      const res = await request(app).get("/api/projects/abc/photo-metadata/diary/101");
      expect(res.status).toBe(400);
    });

    test("Không tìm thấy ảnh trong dự án -> 404", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get("/api/projects/1/photo-metadata/diary/9999");
      expect(res.status).toBe(404);
      expect(res.body.message).toContain("Không tìm thấy ảnh");
    });
  });
});
