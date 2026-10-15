"use strict";

const request = require("supertest");
const express = require("express");

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

const mockClient = {
  query: (...args) => mockClientQuery(...args),
  release: () => mockClientRelease(),
};

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  getClient: jest.fn().mockImplementation(async () => mockClient),
}));

let mockCurrentProjectRole = "ban_quan_ly";

jest.mock("../middleware/auth", () => (req, res, next) => {
  req.user = { id: 1, email: "admin@test.com" };
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

const siteGeofenceRoutes = require("../routes/siteGeofenceRoutes");
const { errorHandler } = require("../middleware/errorHandler");

describe("siteGeofenceRoutes Unit Tests (Story S-41 / T-107 & T-108)", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentProjectRole = "ban_quan_ly";

    app = express();
    app.use(express.json());
    app.use("/api/projects", siteGeofenceRoutes);
    app.use(errorHandler);
  });

  describe("GET /api/projects/:projectId/site-geofence", () => {
    test("Trả về cấu hình phạm vi công trường nếu đã được thiết lập", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            site_latitude: "20.845000",
            site_longitude: "106.688000",
            site_radius_m: 250,
            site_geofence_updated_at: "2026-03-20T10:00:00.000Z",
            site_geofence_updated_by: 1,
          },
        ],
      });

      const res = await request(app).get("/api/projects/1/site-geofence");

      expect(res.status).toBe(200);
      expect(res.body.site_latitude).toBe(20.845);
      expect(res.body.site_longitude).toBe(106.688);
      expect(res.body.site_radius_m).toBe(250);
      expect(res.body.site_geofence_updated_at).toBe("2026-03-20T10:00:00.000Z");
    });

    test("Trả về null nếu dự án chưa thiết lập phạm vi", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            site_latitude: null,
            site_longitude: null,
            site_radius_m: null,
            site_geofence_updated_at: null,
            site_geofence_updated_by: null,
          },
        ],
      });

      const res = await request(app).get("/api/projects/1/site-geofence");

      expect(res.status).toBe(200);
      expect(res.body.site_latitude).toBeNull();
      expect(res.body.site_longitude).toBeNull();
      expect(res.body.site_radius_m).toBeNull();
    });

    test("Trả về 404 nếu không tìm thấy dự án", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/projects/999/site-geofence");
      expect(res.status).toBe(404);
    });

    test("Mọi vai trò thành viên đều được xem cấu hình phạm vi", async () => {
      const roles = [
        "chu_dau_tu",
        "ban_quan_ly",
        "ky_su_giam_sat",
        "chi_huy_truong",
        "doi_truong",
        "ke_toan",
      ];

      for (const r of roles) {
        mockCurrentProjectRole = r;
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 250,
              site_geofence_updated_at: null,
              site_geofence_updated_by: null,
            },
          ],
        });

        const res = await request(app).get("/api/projects/1/site-geofence");
        expect(res.status).toBe(200);
      }
    });
  });

  describe("PUT /api/projects/:projectId/site-geofence - Phân quyền và Validation", () => {
    test("Chỉ ban_quan_ly và chu_dau_tu được cập nhật, các vai trò khác bị 403", async () => {
      const forbiddenRoles = ["ky_su_giam_sat", "chi_huy_truong", "doi_truong", "ke_toan"];

      for (const role of forbiddenRoles) {
        mockCurrentProjectRole = role;
        const res = await request(app)
          .put("/api/projects/1/site-geofence")
          .send({ latitude: 20.845, longitude: 106.688, radius_m: 100 });
        expect(res.status).toBe(403);
      }
    });

    test("Từ chối vĩ độ ngoài phạm vi [-90, 90]", async () => {
      const res = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 91, longitude: 106.688, radius_m: 100 });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("Vĩ độ")])
      );
    });

    test("Từ chối kinh độ ngoài phạm vi [-180, 180]", async () => {
      const res = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 185, radius_m: 100 });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("Kinh độ")])
      );
    });

    test("Từ chối toạ độ có hơn 6 chữ số thập phân", async () => {
      const res = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.8451234, longitude: 106.688, radius_m: 100 });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("Vĩ độ không được vượt quá 6 chữ số thập phân")])
      );
    });

    test("Từ chối toạ độ (0, 0) Null Island", async () => {
      const res = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 0, longitude: 0, radius_m: 100 });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("Null Island")])
      );
    });

    test("Từ chối bán kính không nguyên hoặc ngoài phạm vi [1, 20000]", async () => {
      const res1 = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 106.688, radius_m: 0 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 106.688, radius_m: 25000 });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 106.688, radius_m: 100.5 });
      expect(res3.status).toBe(400);
    });
  });

  describe("PUT /api/projects/:projectId/site-geofence - Giao dịch và Recalculate", () => {
    test("Cập nhật thành công, recalculate và ghi audit_logs trong 1 transaction", async () => {
      mockClientQuery
        // 1. BEGIN
        .mockResolvedValueOnce({})
        // 2. Lock projects row FOR UPDATE
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              site_latitude: null,
              site_longitude: null,
              site_radius_m: null,
            },
          ],
        })
        // 3. UPDATE projects
        .mockResolvedValueOnce({
          rows: [
            {
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 100,
              site_geofence_updated_at: "2026-03-20T10:00:00.000Z",
              site_geofence_updated_by: 1,
            },
          ],
        })
        // 4. SELECT acceptance_voucher_photos (no file_data)
        .mockResolvedValueOnce({
          rows: [
            { id: 101, gps_latitude: "20.845800", gps_longitude: "106.688000", gps_accuracy_m: "10" },
            { id: 102, gps_latitude: "21.028511", gps_longitude: "105.804817", gps_accuracy_m: null },
            { id: 103, gps_latitude: null, gps_longitude: null, gps_accuracy_m: null },
          ],
        })
        // 5. UPDATE acceptance_voucher_photos batch
        .mockResolvedValueOnce({})
        // 6. SELECT diary_entry_attachments
        .mockResolvedValueOnce({
          rows: [],
        })
        // 7. INSERT audit_logs
        .mockResolvedValueOnce({})
        // 8. COMMIT
        .mockResolvedValueOnce({});

      const res = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 106.688, radius_m: 100 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Cấu hình phạm vi công trường thành công");
      expect(res.body.data.site_latitude).toBe(20.845);
      expect(res.body.recalculated.acceptance_photos).toBe(3);

      // Verify transaction queries
      const queryCalls = mockClientQuery.mock.calls.map((c) => c[0]);
      expect(queryCalls[0]).toBe("BEGIN");
      expect(queryCalls[1]).toContain("FOR UPDATE");
      expect(queryCalls[2]).toContain("UPDATE projects");
      expect(queryCalls[3]).toContain("SELECT avp.id");
      expect(queryCalls[3]).not.toContain("file_data"); // Khẳng định KHÔNG select file_data
      expect(queryCalls[4]).toContain("UPDATE acceptance_voucher_photos");
      expect(queryCalls[6]).toContain("INSERT INTO audit_logs");
      expect(queryCalls[7]).toBe("COMMIT");
      expect(mockClientRelease).toHaveBeenCalled();
    });

    test("Rollback giao dịch nếu có lỗi trong quá trình thực hiện", async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("Database connection lost")); // Error

      const res = await request(app)
        .put("/api/projects/1/site-geofence")
        .send({ latitude: 20.845, longitude: 106.688, radius_m: 100 });

      expect(res.status).toBe(500);
      expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/projects/:projectId/site-geofence", () => {
    test("Xóa cấu hình thành công, cập nhật ảnh thành no_site_config/no_gps và ghi audit", async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              site_latitude: "20.845000",
              site_longitude: "106.688000",
              site_radius_m: 100,
            },
          ],
        }) // FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE projects
        .mockResolvedValueOnce({
          rows: [
            { id: 201, gps_latitude: "20.845800", gps_longitude: "106.688000", gps_accuracy_m: "10" },
          ],
        }) // SELECT acceptance_voucher_photos
        .mockResolvedValueOnce({}) // UPDATE acceptance_voucher_photos
        .mockResolvedValueOnce({ rows: [] }) // SELECT diary_entry_attachments
        .mockResolvedValueOnce({}) // INSERT audit_logs
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app).delete("/api/projects/1/site-geofence");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Đã xóa cấu hình phạm vi công trường thành công");

      const queryCalls = mockClientQuery.mock.calls.map((c) => c[0]);
      expect(queryCalls[0]).toBe("BEGIN");
      expect(queryCalls[queryCalls.length - 1]).toBe("COMMIT");
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });
});
