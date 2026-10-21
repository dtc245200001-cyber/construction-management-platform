"use strict";

const request = require("supertest");
const express = require("express");

// Mock db
const mockQuery = jest.fn();
jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: async () => ({
    query: (...args) => mockQuery(...args),
    release: jest.fn(),
  }),
}));

// Mock logger
const mockLoggerWarn = jest.fn();
jest.mock("../utils/logger", () => ({
  warn: (...args) => mockLoggerWarn(...args),
  info: jest.fn(),
  error: jest.fn(),
}));

const {
  checkProjectAccess,
  requirePermission,
  createProjectRouter,
} = require("../middleware/projectAccess");
const { ROLES } = require("../utils/constants");
const { FINANCIAL_KEYS } = require("../utils/financialSerializer");

describe("API Permissions Enforcement (Mức Route Thật — Điểm 9)", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    // Giả lập user đã xác thực
    app.use((req, res, next) => {
      req.user = { id: 99, email: "tester@cmp.vn" };
      next();
    });
  });

  // ── 1. Người ngoài dự án 403 + log reason: NOT_MEMBER ──────────────────────
  test("1. Người ngoài dự án nhận 403 và hệ thống ghi log NOT_MEMBER", async () => {
    // DB trả về rỗng -> user không thuộc dự án
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const router = createProjectRouter();
    router.get(
      "/:projectId/test-route",
      checkProjectAccess,
      requirePermission("project.member"),
      (req, res) => res.json({ ok: true })
    );
    app.use("/api/projects", router);

    const res = await request(app).get("/api/projects/10/test-route");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Bạn không có quyền truy cập dự án này");

    // Kiểm tra log có cấu trúc
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        projectId: "10",
        reason: "NOT_MEMBER",
      }),
      "Truy cập bị từ chối: user không phải thành viên dự án"
    );
  });

  // ── 2. Route mới không khai quyền 403 + log reason: DEFAULT_DENY ───────────
  test("2. Route mới không khai báo quyền tự động bị chặn 403 (Default-Deny)", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const router = createProjectRouter();
    // Route này cố ý KHÔNG gắn requirePermission hay allow
    router.get("/:projectId/unprotected-endpoint", (req, res) => {
      res.json({ secret: "should_never_reach_here" });
    });
    app.use("/api/projects", router);

    const res = await request(app).get("/api/projects/10/unprotected-endpoint");

    process.env.NODE_ENV = originalEnv;

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Chưa phân quyền cho endpoint này");

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        projectId: "10",
        reason: "DEFAULT_DENY",
      }),
      "Truy cập bị từ chối: route không sử dụng wrapper allow()"
    );
  });

  // ── 3. Khách (khach) 403 trên mọi route nghiệp vụ ─────────────────────────
  test("3. Vai trò Khách nhận 403 Forbidden trên mọi route nghiệp vụ", async () => {
    const businessKeys = [
      "work_item.manage",
      "milestone.manage",
      "site_log.close_daily",
      "site_log.correct_locked",
      "diary.resolve_conflict",
      "member.manage",
      "acceptance.approve_official",
      "cost.record",
      "audit.view_project",
    ];

    for (const key of businessKeys) {
      const router = createProjectRouter();
      router.get(
        `/:projectId/route-${key.replace(".", "-")}`,
        (req, res, next) => {
          req.projectRole = ROLES.KHACH; // Giả lập vai trò Khách trong dự án
          next();
        },
        requirePermission(key),
        (req, res) => res.json({ success: true })
      );

      const localApp = express();
      localApp.use(express.json());
      localApp.use((req, res, next) => {
        req.user = { id: 99 };
        next();
      });
      localApp.use("/api/projects", router);

      const res = await request(localApp).get(`/api/projects/10/route-${key.replace(".", "-")}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Vai trò Khách không có quyền");
    }
  });

  // ── 4. Đội trưởng không nhận trường tiền (quét đệ quy toàn bộ JSON) ───────
  test("4. Đội trưởng: Chặn API tài chính (403) và loại bỏ 100% trường tiền ở tầng serializer", async () => {
    // 4.1 Gọi API tài chính trực tiếp -> 403
    const finRouter = createProjectRouter();
    finRouter.post(
      "/:projectId/actual-costs",
      (req, res, next) => {
        req.projectRole = ROLES.DOI_TRUONG;
        next();
      },
      requirePermission("cost.record"),
      (req, res) => res.json({ ok: true })
    );

    const localApp = express();
    localApp.use(express.json());
    localApp.use((req, res, next) => {
      req.user = { id: 99 };
      next();
    });
    localApp.use("/api/projects", finRouter);

    const finRes = await request(localApp).post("/api/projects/10/actual-costs");
    expect(finRes.status).toBe(403);

    // 4.2 Endpoint Đội trưởng truy cập hợp lệ -> Tầng serializer quét sạch trường tiền
    const dataRouter = createProjectRouter();
    dataRouter.get(
      "/:projectId/my-team-tasks",
      (req, res, next) => {
        req.projectRole = ROLES.DOI_TRUONG;
        next();
      },
      requirePermission("task.view_own_team"),
      (req, res) => {
        // Handler vô tình trả về cả trường đơn giá, giá trị hợp đồng, ngân sách
        res.json({
          team_id: 5,
          tasks: [
            {
              id: 101,
              name: "Đổ bê tông sàn tầng 2",
              assigned_quantity: 120,
              unit: "m3",
              unit_price: 1500000,
              contract_value: 180000000,
              budget: 170000000,
              cost: 165000000,
              actual_cost: 160000000,
              retention_amount: 9000000,
              retention_rate: 5,
            },
          ],
        });
      }
    );

    const scanApp = express();
    scanApp.use(express.json());
    scanApp.use((req, res, next) => {
      req.user = { id: 99 };
      next();
    });
    scanApp.use("/api/projects", dataRouter);

    const scanRes = await request(scanApp).get("/api/projects/10/my-team-tasks");
    expect(scanRes.status).toBe(200);

    // Hàm đệ quy kiểm tra không còn bất kỳ trường tiền tệ nào
    function scanKeys(obj, foundKeys = []) {
      if (!obj || typeof obj !== "object") return foundKeys;
      for (const [k, v] of Object.entries(obj)) {
        if (FINANCIAL_KEYS.has(k.toLowerCase())) {
          foundKeys.push(k);
        }
        if (typeof v === "object") {
          scanKeys(v, foundKeys);
        }
      }
      return foundKeys;
    }

    const leakedKeys = scanKeys(scanRes.body);
    expect(leakedKeys).toEqual([]); // Khẳng định 0 trường tiền bị lọt ra
    expect(scanRes.body.tasks[0].name).toBe("Đổ bê tông sàn tầng 2");
    expect(scanRes.body.tasks[0].unit_price).toBeUndefined();
    expect(scanRes.body.tasks[0].contract_value).toBeUndefined();
    expect(scanRes.body.tasks[0].budget).toBeUndefined();
  });

  // ── 5. Không có API sửa/xóa nhật ký thao tác ──────────────────────────────
  test("5. Không tồn tại bất kỳ API nào để sửa (PUT/PATCH) hoặc xoá (DELETE) nhật ký thao tác", async () => {
    // Import router acceptance (chứa GET /:projectId/audit-logs) và adminRoutes (chứa GET /api/admin/audit-logs)
    const acceptanceRouter = require("../routes/acceptanceRoutes");
    const adminRouter = require("../routes/adminRoutes");

    const auditApp = express();
    auditApp.use(express.json());
    auditApp.use((req, res, next) => {
      req.user = { id: 1, is_system_admin: true };
      req.projectRole = "ban_quan_ly";
      next();
    });
    auditApp.use("/api/projects", acceptanceRouter);
    auditApp.use("/api/admin", adminRouter);

    // Thử gửi PUT, PATCH, DELETE vào endpoint audit-logs dự án
    const putRes = await request(auditApp).put("/api/projects/10/audit-logs/1");
    expect([404, 405]).toContain(putRes.status);

    const patchRes = await request(auditApp).patch("/api/projects/10/audit-logs/1");
    expect([404, 405]).toContain(patchRes.status);

    const delRes = await request(auditApp).delete("/api/projects/10/audit-logs/1");
    expect([404, 405]).toContain(delRes.status);

    // Thử gửi PUT, PATCH, DELETE vào endpoint audit-logs hệ thống của Admin
    const adminPutRes = await request(auditApp).put("/api/admin/audit-logs/1");
    expect([401, 403, 404, 405]).toContain(adminPutRes.status);

    const adminDelRes = await request(auditApp).delete("/api/admin/audit-logs/1");
    expect([401, 403, 404, 405]).toContain(adminDelRes.status);
  });

  // ── 6. F-06: CHT sửa cây WBS bị 403; cập nhật tiến độ & giao việc thành công ──
  test("6. F-06: Chỉ huy trưởng sửa cây WBS nhận 403; vẫn cập nhật tiến độ (S-15) và giao việc (S-25) được", async () => {
    const f06Router = createProjectRouter();

    // 6.1 Sửa cây hạng mục/việc -> work_item.manage (chỉ BQL có quyền)
    f06Router.put(
      "/:projectId/categories/:id",
      (req, res, next) => {
        req.projectRole = ROLES.CHI_HUY_TRUONG;
        next();
      },
      requirePermission("work_item.manage"),
      (req, res) => res.json({ success: true })
    );

    // 6.2 Cập nhật tiến độ thực tế (S-15)
    f06Router.patch(
      "/:projectId/tasks/:taskId/progress",
      (req, res, next) => {
        req.projectRole = ROLES.CHI_HUY_TRUONG;
        next();
      },
      requirePermission("project.member"),
      (req, res) => res.json({ progress_updated: true })
    );

    // 6.3 Giao việc cho đội thi công (S-25 / task.assign)
    f06Router.post(
      "/:projectId/teams/:teamId/assignments",
      (req, res, next) => {
        req.projectRole = ROLES.CHI_HUY_TRUONG;
        next();
      },
      requirePermission("task.assign"),
      (req, res) => res.json({ assigned: true })
    );

    const f06App = express();
    f06App.use(express.json());
    f06App.use((req, res, next) => {
      req.user = { id: 99 };
      next();
    });
    f06App.use("/api/projects", f06Router);

    // (a) Chỉ huy trưởng sửa hạng mục WBS -> 403 Forbidden
    const editWbsRes = await request(f06App).put("/api/projects/10/categories/1");
    expect(editWbsRes.status).toBe(403);
    expect(editWbsRes.body.error).toContain("không có quyền work_item.manage");

    // (b) Chỉ huy trưởng cập nhật tiến độ -> 200 OK
    const progressRes = await request(f06App).patch("/api/projects/10/tasks/101/progress");
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.progress_updated).toBe(true);

    // (c) Chỉ huy trưởng giao việc cho đội -> 200 OK
    const assignRes = await request(f06App).post("/api/projects/10/teams/5/assignments");
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.assigned).toBe(true);
  });
});
