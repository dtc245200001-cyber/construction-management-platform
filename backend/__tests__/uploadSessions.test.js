const request = require("supertest");
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Mocks
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: () => mockConnect(),
}));

// Mock middlewares
jest.mock("../middleware/auth", () => (req, res, next) => {
  req.user = { id: 1, email: "engineer@example.com", name: "Kỹ sư", role: "ky_su_giam_sat" };
  next();
});

jest.mock("../middleware/projectAccess", () => {
  const express = require("express");
  return {
    checkProjectAccess: (req, res, next) => {
      req.projectRole = "ky_su_giam_sat";
      next();
    },
    requireProjectRoles: () => (req, res, next) => next(),
    allow: () => (req, res, next) => next(),
    createProjectRouter: () => express.Router(),
    defaultDeny: (req, res, next) => next(),
  };
});

jest.mock("../lib/cloudinary", () => ({
  isCloudinaryConfigured: () => false,
  uploadToCloudinary: jest.fn(),
}));

const uploadSessionRoutes = require("../routes/uploadSessionRoutes");
const { errorHandler } = require("../middleware/errorHandler");

let clientQueryHandlers = [];

describe("UploadSessionRoutes (T-81 Resumable Chunked Upload)", () => {
  let app;
  const tempDir = path.join(__dirname, "..", "uploads", "temp_sessions");

  beforeEach(() => {
    jest.clearAllMocks();
    clientQueryHandlers = [];

    mockClientQuery.mockImplementation(async (sql, params) => {
      const trimmed = typeof sql === "string" ? sql.trim().toUpperCase() : "";
      if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
        return { rows: [] };
      }
      if (clientQueryHandlers.length > 0) {
        const handler = clientQueryHandlers.shift();
        if (typeof handler === "function") {
          return handler(sql, params);
        }
        return handler;
      }
      return { rows: [] };
    });

    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });

    app = express();
    app.use(express.json());
    app.use("/api/projects", uploadSessionRoutes);
    app.use(errorHandler);
  });

  afterAll(() => {
    // Cleanup any lingering temp test files
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const f of files) {
        if (f.endsWith(".part")) {
          try {
            fs.unlinkSync(path.join(tempDir, f));
          } catch (e) {
            // ignore
          }
        }
      }
    }
  });

  describe("POST /api/projects/:projectId/upload-sessions", () => {
    test("từ chối khi thiếu file_name", async () => {
      const res = await request(app)
        .post("/api/projects/1/upload-sessions")
        .send({
          file_size: 1024,
          mime_type: "image/jpeg",
          checksum: "a".repeat(64),
          task_log_id: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("file_name");
    });

    test("từ chối khi file_size vượt quá 50MB", async () => {
      const res = await request(app)
        .post("/api/projects/1/upload-sessions")
        .send({
          file_name: "huge.jpg",
          file_size: 60 * 1024 * 1024,
          mime_type: "image/jpeg",
          checksum: "a".repeat(64),
          task_log_id: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("50 MB");
    });

    test("từ chối khi mime_type không phải là ảnh hợp lệ", async () => {
      const res = await request(app)
        .post("/api/projects/1/upload-sessions")
        .send({
          file_name: "script.sh",
          file_size: 1024,
          mime_type: "application/x-sh",
          checksum: "a".repeat(64),
          task_log_id: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Loại file không hợp lệ");
    });

    test("từ chối khi checksum không phải chuỗi sha256 64 ký tự hex", async () => {
      const res = await request(app)
        .post("/api/projects/1/upload-sessions")
        .send({
          file_name: "photo.jpg",
          file_size: 1024,
          mime_type: "image/jpeg",
          checksum: "not-a-sha256-hash",
          task_log_id: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("checksum");
    });

    test("từ chối khi không có cả task_log_id lẫn diary_entry_id", async () => {
      const res = await request(app)
        .post("/api/projects/1/upload-sessions")
        .send({
          file_name: "photo.jpg",
          file_size: 1024,
          mime_type: "image/jpeg",
          checksum: "a".repeat(64),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("task_log_id");
    });

    test("khởi tạo session thành công khi dữ liệu hợp lệ", async () => {
      // Mock task_log check
      clientQueryHandlers.push({
        rows: [{ id: 10, task_id: 5, project_id: 1 }],
      });

      // Mock insert upload_sessions
      const fakeSessionId = "11111111-2222-3333-4444-555555555555";
      clientQueryHandlers.push({
        rows: [
          {
            session_id: fakeSessionId,
            project_id: 1,
            task_log_id: 10,
            file_name: "site_photo.jpg",
            file_size: 2048,
            chunk_size: 524288,
            total_chunks: 1,
            status: "active",
          },
        ],
      });

      const res = await request(app)
        .post("/api/projects/1/upload-sessions")
        .send({
          file_name: "site_photo.jpg",
          file_size: 2048,
          mime_type: "image/jpeg",
          checksum: "e".repeat(64),
          task_log_id: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.session_id).toBe(fakeSessionId);
      expect(res.body.file_size).toBe(2048);
      expect(res.body.bytes_uploaded).toBe(0);
      expect(res.body.status).toBe("active");
    });
  });

  describe("GET /api/projects/:projectId/upload-sessions/:sessionId", () => {
    test("trả về 404 khi không tìm thấy session", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(
        "/api/projects/1/upload-sessions/11111111-2222-3333-4444-555555555555"
      );

      expect(res.status).toBe(404);
    });

    test("trả về tiến độ và offset hiện tại để resume khi session tồn tại", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            session_id: "11111111-2222-3333-4444-555555555555",
            file_name: "photo.jpg",
            file_size: "1048576",
            bytes_uploaded: "524288",
            chunk_size: 524288,
            chunks_received: 1,
            total_chunks: 2,
            status: "active",
          },
        ],
      });

      const res = await request(app).get(
        "/api/projects/1/upload-sessions/11111111-2222-3333-4444-555555555555"
      );

      expect(res.status).toBe(200);
      expect(res.body.offset).toBe(524288);
      expect(res.body.bytes_uploaded).toBe(524288);
      expect(res.body.file_size).toBe(1048576);
      expect(res.body.is_completed).toBe(false);
    });
  });

  describe("PATCH /api/projects/:projectId/upload-sessions/:sessionId/chunk", () => {
    const testSessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const testTempFile = path.join(tempDir, `${testSessionId}.part`);

    afterEach(() => {
      try {
        if (fs.existsSync(testTempFile)) fs.unlinkSync(testTempFile);
      } catch (e) {
        // ignore
      }
    });

    test("trả về 409 Conflict khi offset không khớp với bytes_uploaded của server", async () => {
      clientQueryHandlers.push({
        rows: [
          {
            id: 1,
            session_id: testSessionId,
            status: "active",
            bytes_uploaded: 1024,
            file_size: 2048,
          },
        ],
      });

      const chunk = Buffer.from("test-data");
      const res = await request(app)
        .patch(`/api/projects/1/upload-sessions/${testSessionId}/chunk`)
        .set("Content-Type", "application/octet-stream")
        .set("Upload-Offset", "0") // Gửi offset 0 trong khi server đang ở offset 1024
        .send(chunk);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("OFFSET_MISMATCH");
      expect(res.body.expected_offset).toBe(1024);
    });

    test("nhận chunk thành công và cập nhật offset khi chưa hết file", async () => {
      fs.writeFileSync(testTempFile, Buffer.alloc(0));

      clientQueryHandlers.push({
        rows: [
          {
            id: 1,
            session_id: testSessionId,
            status: "active",
            bytes_uploaded: 0,
            file_size: 10,
            temp_file_path: testTempFile,
          },
        ],
      });
      // Mock update query
      clientQueryHandlers.push({ rows: [] });

      const chunk = Buffer.from("12345"); // 5 bytes
      const res = await request(app)
        .patch(`/api/projects/1/upload-sessions/${testSessionId}/chunk`)
        .set("Content-Type", "application/octet-stream")
        .set("Upload-Offset", "0")
        .send(chunk);

      expect(res.status).toBe(200);
      expect(res.body.bytes_uploaded).toBe(5);
      expect(res.body.status).toBe("active");
      expect(fs.readFileSync(testTempFile).toString()).toBe("12345");
    });

    test("báo lỗi 422 CHECKSUM_MISMATCH khi nhận đủ file nhưng SHA-256 không khớp", async () => {
      const fileData = Buffer.from("complete-file-corrupted");
      fs.writeFileSync(testTempFile, Buffer.alloc(0));

      clientQueryHandlers.push({
        rows: [
          {
            id: 1,
            session_id: testSessionId,
            status: "active",
            bytes_uploaded: 0,
            file_size: fileData.length,
            checksum: "0".repeat(64), // Checksum sai
            temp_file_path: testTempFile,
          },
        ],
      });
      // Mock update aborted
      clientQueryHandlers.push({ rows: [] });

      const res = await request(app)
        .patch(`/api/projects/1/upload-sessions/${testSessionId}/chunk`)
        .set("Content-Type", "application/octet-stream")
        .set("Upload-Offset", "0")
        .send(fileData);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("CHECKSUM_MISMATCH");
    });

    test("hoàn thành session, gắn vào task_attachments và dọn dẹp temp khi checksum khớp", async () => {
      const fileData = Buffer.from("clean-photo-data-valid");
      const validChecksum = crypto.createHash("sha256").update(fileData).digest("hex");

      fs.writeFileSync(testTempFile, Buffer.alloc(0));

      clientQueryHandlers.push({
        rows: [
          {
            id: 1,
            session_id: testSessionId,
            status: "active",
            bytes_uploaded: 0,
            file_size: fileData.length,
            checksum: validChecksum,
            temp_file_path: testTempFile,
            file_name: "test.jpg",
            mime_type: "image/jpeg",
            task_log_id: 10,
          },
        ],
      });

      // Mock INSERT task_attachments
      clientQueryHandlers.push({
        rows: [
          {
            id: 88,
            task_log_id: 10,
            file_name: "test.jpg",
            file_size: fileData.length,
            mime_type: "image/jpeg",
            created_at: new Date().toISOString(),
          },
        ],
      });

      // Mock query task_id
      clientQueryHandlers.push({
        rows: [{ task_id: 5 }],
      });

      // Mock update session completed
      clientQueryHandlers.push({ rows: [] });

      const res = await request(app)
        .patch(`/api/projects/1/upload-sessions/${testSessionId}/chunk`)
        .set("Content-Type", "application/octet-stream")
        .set("Upload-Offset", "0")
        .send(fileData);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("completed");
      expect(res.body.is_completed).toBe(true);
      expect(res.body.attachment.id).toBe(88);
      expect(res.body.attachment.file_name).toBe("test.jpg");
      // Verify temp file was cleaned up
      expect(fs.existsSync(testTempFile)).toBe(false);
    });
  });
});
