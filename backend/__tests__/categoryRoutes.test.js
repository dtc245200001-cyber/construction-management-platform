const request = require("supertest");
const express = require("express");

// Mocks
const mockQuery = jest.fn();
const mockConnect = jest.fn();
jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: () => mockConnect(),
}));

// Mock middlewares
jest.mock("../middleware/auth", () => (req, res, next) => next());
jest.mock("../middleware/projectAccess", () => ({
  checkProjectAccess: (req, res, next) => next(),
  requireProjectRoles: () => (req, res, next) => next(),
}));

const categoryRoutes = require("../routes/categoryRoutes");
const { errorHandler } = require("../middleware/errorHandler");

describe("categoryRoutes (1.8)", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/categories", categoryRoutes);
    app.use(errorHandler); // để bắt asyncHandler throw
  });

  describe("GET /:projectId/tree/all", () => {
    test("tra ve danh sach phang", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "A", parent_id: null }] });
      const res = await request(app).get("/api/categories/1/tree/all");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 1, name: "A", parent_id: null }]);
    });
  });

  describe("POST /:projectId (Them hang muc)", () => {
    let clientMock;
    beforeEach(() => {
      clientMock = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockConnect.mockResolvedValue(clientMock);
    });

    test("tu choi neu name trong (validate)", async () => {
      const res = await request(app).post("/api/categories/1").send({ name: "   " });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Tên hạng mục là bắt buộc/);
    });

    test("kiem tra parent thuoc cung project roi moi insert (transaction)", async () => {
      // BEGIN
      clientMock.query.mockResolvedValueOnce();
      // Parent check: tra ve 1 dong (hop le)
      clientMock.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      // INSERT RETURNING
      clientMock.query.mockResolvedValueOnce({ rows: [{ id: 2, name: "B", parent_id: 1 }] });
      // COMMIT
      clientMock.query.mockResolvedValueOnce();

      const res = await request(app).post("/api/categories/1").send({ name: "B", parent_id: 1 });
      
      expect(res.status).toBe(201);
      expect(clientMock.query).toHaveBeenCalledWith("BEGIN");
      expect(clientMock.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id FROM work_items WHERE id = $1 AND project_id = $2"),
        [1, 1]
      );
      expect(clientMock.query).toHaveBeenCalledWith("COMMIT");
      expect(clientMock.release).toHaveBeenCalled();
    });

    test("rollback neu parent khong thuoc du an", async () => {
      // BEGIN
      clientMock.query.mockResolvedValueOnce();
      // Parent check: rong -> tuc la parent id thuoc project khac
      clientMock.query.mockResolvedValueOnce({ rows: [] });
      // ROLLBACK duoc goi ben trong
      clientMock.query.mockResolvedValueOnce();

      const res = await request(app).post("/api/categories/1").send({ name: "B", parent_id: 99 });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Hạng mục cha không thuộc dự án này/);
      expect(clientMock.query).toHaveBeenCalledWith("ROLLBACK");
      expect(clientMock.release).toHaveBeenCalled();
    });
  });
});
