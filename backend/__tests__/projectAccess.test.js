const request = require("supertest");
const express = require("express");

const mockQuery = jest.fn();
jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
}));

const mockLoggerWarn = jest.fn();
jest.mock("../utils/logger", () => ({
  warn: (...args) => mockLoggerWarn(...args),
}));

const { checkProjectAccess, requireProjectRoles } = require("../middleware/projectAccess");

describe("projectAccess middleware (1.9)", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    // Mock middleware auth
    app.use((req, res, next) => {
      req.user = { id: 10 };
      next();
    });
  });

  describe("checkProjectAccess", () => {
    test("tra 400 thi thieu projectId", async () => {
      app.get("/test", checkProjectAccess, (req, res) => res.sendStatus(200));
      const res = await request(app).get("/test");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Thiếu projectId hoặc projectId không hợp lệ");
    });

    test("tra 403 va ghi log co cau truc khi khong la thanh vien", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      app.get("/test/:projectId", checkProjectAccess, (req, res) => res.sendStatus(200));

      const res = await request(app).get("/test/1");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/quyền truy cập/);
      
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 10,
          projectId: "1",
          reason: "NOT_MEMBER",
        }),
        "Truy cập bị từ chối: user không phải thành viên dự án"
      );
    });

    test("di tiep va gan req.projectRole khi la thanh vien", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "manager" }] });
      app.get("/test/:projectId", checkProjectAccess, (req, res) => {
        res.json({ role: req.projectRole });
      });

      const res = await request(app).get("/test/1");
      expect(res.status).toBe(200);
      expect(res.body.role).toBe("MANAGER");
    });
  });

  describe("requireProjectRoles", () => {
    test("tra 403 va ghi log mac dinh tu choi (default deny) neu khong truyen role", async () => {
      app.get("/test/:projectId", (req, res, next) => {
        req.projectRole = "OWNER";
        next();
      }, requireProjectRoles(), (req, res) => res.sendStatus(200));

      const res = await request(app).get("/test/1");
      expect(res.status).toBe(403);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "ROLE_NOT_ALLOWED" }),
        expect.stringContaining("default deny")
      );
    });

    test("tra 403 va ghi log neu role khong nam trong allowed", async () => {
      app.get("/test/:projectId", (req, res, next) => {
        req.projectRole = "MEMBER";
        next();
      }, requireProjectRoles(["OWNER"]), (req, res) => res.sendStatus(200));

      const res = await request(app).get("/test/1");
      expect(res.status).toBe(403);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          currentRole: "MEMBER",
          allowedRoles: ["OWNER"],
          reason: "ROLE_NOT_ALLOWED"
        }),
        "Truy cập bị từ chối: vai trò không đủ quyền"
      );
    });

    test("di tiep neu role thuoc allowed", async () => {
      app.get("/test/:projectId", (req, res, next) => {
        req.projectRole = "OWNER";
        next();
      }, requireProjectRoles(["MANAGER", "OWNER"]), (req, res) => res.sendStatus(200));

      const res = await request(app).get("/test/1");
      expect(res.status).toBe(200);
    });
  });
});