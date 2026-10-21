"use strict";

const express = require("express");
const request = require("supertest");

const mockQuery = jest.fn();
const mockConnect = jest.fn();
jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: () => mockConnect(),
}));

const mockLogAudit = jest.fn();
jest.mock("../utils/auditLogger", () => {
  const actual = jest.requireActual("../utils/auditLogger");
  return {
    ...actual,
    logAudit: (...args) => mockLogAudit(...args),
  };
});

const {
  checkUserProjectCreatePermission,
  requireProjectCreatePermission,
} = require("../middleware/projectCreationGuard");

describe("S-04: Phân quyền tạo dự án (project.create) và xác thực Ban quản lý", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. checkUserProjectCreatePermission logic", () => {
    test("System Admin luôn được phép tạo dự án (true)", async () => {
      const allowed = await checkUserProjectCreatePermission(1, true);
      expect(allowed).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test("Chưa đăng nhập / không có userId -> trả về false", async () => {
      const allowed = await checkUserProjectCreatePermission(null, false);
      expect(allowed).toBe(false);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test("User đang giữ vai trò Ban quản lý, tài khoản đã xác thực và không bị khóa -> trả về true", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      const allowed = await checkUserProjectCreatePermission(10, false);
      expect(allowed).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("pm.role = 'ban_quan_ly'"),
        [10]
      );
    });

    test("User đã bị gỡ khỏi vai trò Ban quản lý (hoặc chỉ giữ vai trò khác) -> trả về false", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const allowed = await checkUserProjectCreatePermission(20, false);
      expect(allowed).toBe(false);
    });
  });

  describe("2. requireProjectCreatePermission middleware", () => {
    let app;

    beforeEach(() => {
      app = express();
      app.use(express.json());
    });

    test("Chưa đăng nhập -> trả về 401", async () => {
      app.post("/test-create", requireProjectCreatePermission, (req, res) => res.sendStatus(200));

      const res = await request(app).post("/test-create").send({ name: "Test Project" });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Chưa đăng nhập");
    });

    test("User không có quyền (không phải Admin, không phải BQL) -> trả về 403 và ghi audit log CREATE_PROJECT_DENIED", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // không tìm thấy BQL hợp lệ

      app.use((req, res, next) => {
        req.session = {
          user: { id: 99, email: "cht@test.com", role: "chi_huy_truong", is_system_admin: false },
        };
        next();
      });
      app.post("/test-create", requireProjectCreatePermission, (req, res) => res.sendStatus(200));

      const res = await request(app)
        .post("/test-create")
        .set("X-Forwarded-For", "203.0.113.195")
        .send({ name: "Dự án trái phép", password: "should-be-redacted" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Chỉ System Admin hoặc người đang giữ vai trò Ban quản lý/);

      // Kiểm tra ghi audit log
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 99,
          action: "CREATE_PROJECT_DENIED",
          entity: "projects",
          ipAddress: "203.0.113.195",
          details: expect.objectContaining({
            body: expect.objectContaining({
              password: "[REDACTED]",
            }),
          }),
        })
      );
    });

    test("User hợp lệ (BQL) -> cho phép đi tiếp vào handler", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

      app.use((req, res, next) => {
        req.session = {
          user: { id: 10, email: "bql@test.com", role: "ban_quan_ly", is_system_admin: false },
        };
        next();
      });
      app.post("/test-create", requireProjectCreatePermission, (req, res) => {
        res.status(200).json({ ok: true, isSystemAdminCreator: req.isSystemAdminCreator });
      });

      const res = await request(app).post("/test-create").send({ name: "Dự án mới" });
      expect(res.status).toBe(200);
      expect(res.body.isSystemAdminCreator).toBe(false);
    });
  });

  describe("3. GET /api/auth/me/permissions trả cờ project.create", () => {
    let app;

    beforeEach(() => {
      app = express();
      app.use(express.json());
    });

    test("Trả can_create_project = true cho Ban quản lý", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // query check BQL

      app.use((req, res, next) => {
        req.session = {
          user: { id: 10, is_system_admin: false, role: "ban_quan_ly" },
        };
        next();
      });
      const authRoutes = require("../routes/authRoutes");
      app.use("/api/auth", authRoutes);

      const res = await request(app).get("/api/auth/me/permissions");
      expect(res.status).toBe(200);
      expect(res.body.permissions?.["project.create"]).toBe(true);
      expect(res.body.can_create_project).toBe(true);
    });

    test("Trả can_create_project = false cho 6 vai trò khác (ví dụ: chu_dau_tu)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // không có BQL

      app.use((req, res, next) => {
        req.session = {
          user: { id: 22, is_system_admin: false, role: "chu_dau_tu" },
        };
        next();
      });
      const authRoutes = require("../routes/authRoutes");
      app.use("/api/auth", authRoutes);

      const res = await request(app).get("/api/auth/me/permissions");
      expect(res.status).toBe(200);
      expect(res.body.permissions?.["project.create"]).toBe(false);
      expect(res.body.can_create_project).toBe(false);
    });
  });

  describe("4. POST /api/projects quy tắc khởi tạo và transaction", () => {
    let app;
    let mockClient;

    beforeEach(() => {
      app = express();
      app.use(express.json());

      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockConnect.mockResolvedValue(mockClient);
    });

    test("System Admin tạo dự án thiếu PM -> HTTP 422", async () => {
      app.use((req, res, next) => {
        req.session = {
          user: { id: 1, email: "admin@test.com", is_system_admin: true },
        };
        next();
      });
      const projectRoutes = require("../routes/projectRoutes");
      app.use("/api/projects", projectRoutes);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Dự án", code: "PRJ-01" });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/bắt buộc chỉ định ít nhất một Ban quản lý/i);
    });

    test("System Admin chỉ định PM không tồn tại -> HTTP 422", async () => {
      app.use((req, res, next) => {
        req.session = {
          user: { id: 1, email: "admin@test.com", is_system_admin: true },
        };
        next();
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Không tìm thấy user

      const projectRoutes = require("../routes/projectRoutes");
      app.use("/api/projects", projectRoutes);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Dự án", code: "PRJ-01", pm_email: "nonexistent@test.com" });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/không tồn tại/i);
    });

    test("System Admin chỉ định PM có vai trò khách (khach) -> HTTP 422", async () => {
      app.use((req, res, next) => {
        req.session = {
          user: { id: 1, email: "admin@test.com", is_system_admin: true },
        };
        next();
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 88, email: "khach@test.com", role: "khach", is_verified: true, locked_until: null }],
      });

      const projectRoutes = require("../routes/projectRoutes");
      app.use("/api/projects", projectRoutes);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Dự án", code: "PRJ-01", pm_email: "khach@test.com" });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/vai trò khách không được chỉ định/i);
    });

    test("System Admin chỉ định PM hợp lệ -> Tạo dự án thành công, chỉ PM được thêm vào project_members (System Admin không vào)", async () => {
      app.use((req, res, next) => {
        req.session = {
          user: { id: 1, email: "admin@test.com", is_system_admin: true },
        };
        next();
      });
      // 1. user check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 77, email: "validpm@test.com", role: "ban_quan_ly", is_verified: true, locked_until: null }],
      });
      // 2. check code unique
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // check unique code
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 200, name: "Dự án Chuẩn", code: "PRJ-01" }] }); // insert project
      mockClient.query.mockResolvedValueOnce({}); // insert calendar
      mockClient.query.mockResolvedValueOnce({}); // insert project_members
      mockClient.query.mockResolvedValueOnce({}); // COMMIT

      const projectRoutes = require("../routes/projectRoutes");
      app.use("/api/projects", projectRoutes);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Dự án Chuẩn", code: "PRJ-01", pm_email: "validpm@test.com" });

      expect(res.status).toBe(201);
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");

      // Kiểm tra lệnh insert project_members: gán cho PM (id=77), KHÔNG gán cho Admin (id=1)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO project_members"),
        [200, 77, "ban_quan_ly"]
      );
    });

    test("Ban quản lý tạo dự án -> Trong 1 transaction tạo dự án và gán BQL; lỗi thì rollback", async () => {
      // User là Ban quản lý
      mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // checkUserProjectCreatePermission

      app.use((req, res, next) => {
        req.session = {
          user: { id: 10, email: "bql@test.com", role: "ban_quan_ly", is_system_admin: false },
        };
        next();
      });

      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // check code unique
      // Giả lập lỗi khi insert project
      mockClient.query.mockRejectedValueOnce(new Error("Database connection error"));
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      const projectRoutes = require("../routes/projectRoutes");
      app.use("/api/projects", projectRoutes);

      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Dự án BQL", code: "PRJ-BQL" });

      expect(res.status).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
