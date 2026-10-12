"use strict";

// S-36 / T-93: Kiểm thử toàn diện luồng tạo và xem phiếu nghiệm thu khối lượng
//
// Yêu cầu:
//   - Kiểm thử nhập sai, validate dữ liệu (400)
//   - Luỹ kế bằng đợt trước (đợt = 0.000)
//   - Phiếu nhiều hạng mục
//   - Nhiều đợt liên tiếp
//   - Đợt âm (luỹ kế mới < luỹ kế đã duyệt, delta < 0, has_negative_delta = true)
//   - Hạng mục ngoài dự án hoặc không phải hạng mục lá (422)
//   - Kiểm tra ảnh: định dạng magic bytes thật, từ chối định dạng sai (400)
//   - Phân quyền theo dự án: người ngoài dự án -> 403, không có quyền -> 403
//
// TẤT CẢ SỐ KỲ VỌNG TRONG TEST LÀ SỐ CỨNG TÍNH TAY.

const request = require("supertest");
const express = require("express");

// Mock database
const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn().mockImplementation(() => Promise.resolve(mockClient)),
}));

// Mock logger
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock middleware auth
jest.mock("../middleware/auth", () => (req, _res, next) => {
  req.user = req.session?.user || req.user || { id: 10, is_system_admin: false };
  next();
});

const acceptanceRoutes = require("../routes/acceptanceRoutes");
const { errorHandler } = require("../middleware/errorHandler");

describe("Acceptance Flow & Security Verification (S-36 / T-93)", () => {
  let app;
  let currentUser = { id: 10, is_system_admin: false };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 10, is_system_admin: false };

    app = express();
    app.use(express.json());

    // Mock middleware inject session & user
    app.use((req, _res, next) => {
      req.session = { user: currentUser };
      req.user = currentUser;
      next();
    });

    app.use("/api/projects", acceptanceRoutes);
    app.use(errorHandler);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 1: VALIDATION ĐẦU VÀO (NHẬP SAI, TRÙNG LẶP, SỐ ÂM)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Validation đầu vào khi tạo phiếu", () => {
    test("TC-1.1: Thiếu hoặc rỗng batch_name -> 400", async () => {
      // Mock user là thành viên dự án và có quyền kỹ sư giám sát
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: "ky_su_giam_sat" }],
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "   ",
          items: [{ work_item_id: 1, cumulative_quantity: "100.000" }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/batch_name/i);
    });

    test("TC-1.2: Danh sách items rỗng -> 400", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: "ky_su_giam_sat" }],
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/items.*không được rỗng/i);
    });

    test("TC-1.3: Luỹ kế âm bị từ chối ở tầng validation -> 400", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: "ky_su_giam_sat" }],
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [{ work_item_id: 1, cumulative_quantity: "-50.000" }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/không hợp lệ/i);
      expect(res.body.item_errors[0].errors.cumulative_quantity).toMatch(/không được âm/i);
    });

    test("TC-1.4: Trùng work_item_id trong cùng 1 request -> 400", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: "ky_su_giam_sat" }],
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [
            { work_item_id: 1, cumulative_quantity: "50.000" },
            { work_item_id: 1, cumulative_quantity: "60.000" },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/trùng lặp/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 2: TỪ CHỐI HẠNG MỤC NGOÀI DỰ ÁN HOẶC KHÔNG PHẢI LÁ (422)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Kiểm tra tính hợp lệ của hạng mục", () => {
    test("TC-2.1: Hạng mục không thuộc dự án -> 422", async () => {
      // Mock membership
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      // Transaction BEGIN
      mockClient.query.mockResolvedValueOnce({});
      // Query check hạng mục: trả về rỗng vì không thuộc project 1
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Transaction ROLLBACK
      mockClient.query.mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [{ work_item_id: 999, cumulative_quantity: "100.000" }],
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/không hợp lệ/i);
      expect(res.body.invalid_items[0].reason).toMatch(/không thuộc dự án/i);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    test("TC-2.2: Hạng mục cha (không phải lá) -> 422", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        // is_leaf = false
        rows: [{ id: 10, unit: "m3", is_leaf: false }],
      });
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [{ work_item_id: 10, cumulative_quantity: "100.000" }],
        });

      expect(res.status).toBe(422);
      expect(res.body.invalid_items[0].reason).toMatch(/hạng mục lá/i);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 3: PHÂN QUYỀN VÀ BẢO VỆ DỮ LIỆU ĐA DỰ ÁN (403)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Phân quyền và bảo mật đa dự án", () => {
    test("TC-3.1: Người ngoài dự án gọi API tạo phiếu -> 403", async () => {
      // project_members query trả về rỗng
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [{ work_item_id: 1, cumulative_quantity: "10.000" }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/quyền truy cập dự án/i);
    });

    test("TC-3.2: Thành viên không có quyền lập phiếu (doi_truong) -> 403", async () => {
      // doi_truong là thành viên nhưng không có quyền acceptance.create_dossier
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "doi_truong" }] });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [{ work_item_id: 1, cumulative_quantity: "10.000" }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error || res.body.message).toMatch(/không có quyền/i);
    });

    test("TC-3.3: Người ngoài dự án gọi GET danh sách phiếu -> 403", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/projects/999/acceptance-vouchers");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/quyền truy cập dự án/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 4: LUỸ KẾ BẰNG ĐỢT TRƯỚC (ĐỢT = 0)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Khối lượng đợt bằng 0", () => {
    test("TC-4.1: Luỹ kế mới = Luỹ kế đã duyệt trước (50.000 = 50.000) -> delta = 0.000", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // check hạng mục
          rows: [{ id: 5, unit: "m3", is_leaf: true }],
        })
        .mockResolvedValueOnce({
          // prev approved cumulative = 50.000 (tính tay: 50.000 - 50.000 = 0.000)
          rows: [{ work_item_id: 5, prev_approved_cumulative: "50.000" }],
        })
        .mockResolvedValueOnce({
          // insert voucher
          rows: [
            {
              id: 101,
              project_id: 1,
              batch_name: "Đợt 2",
              status: "draft",
              has_negative_delta: false,
              created_by: 10,
            },
          ],
        })
        .mockResolvedValueOnce({}) // insert items
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 2",
          items: [{ work_item_id: 5, cumulative_quantity: "50.000" }],
        });

      expect(res.status).toBe(201);
      expect(res.body.voucher.has_negative_delta).toBe(false);

      // Số tính tay cứng: delta_quantity = 0.000
      expect(res.body.items[0].delta_quantity).toBe("0.000");
      expect(res.body.items[0].prev_approved_cumulative).toBe("50.000");
      expect(res.body.items[0].cumulative_quantity).toBe("50.000");
      expect(res.body.warnings).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 5: PHIẾU NHIỀU HẠNG MỤC
  // ───────────────────────────────────────────────────────────────────────────
  describe("Phiếu nhiều hạng mục lá", () => {
    test("TC-5.1: 3 hạng mục trong 1 phiếu — tính độc lập chính xác", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // check 3 hạng mục
          rows: [
            { id: 1, unit: "m3", is_leaf: true },
            { id: 2, unit: "m2", is_leaf: true },
            { id: 3, unit: "tấn", is_leaf: true },
          ],
        })
        // prev approved for all 3 items (id 1 = 60.000, id 2 = 25.500, id 3 chưa có -> 0)
        .mockResolvedValueOnce({
          rows: [
            { work_item_id: 1, prev_approved_cumulative: "60.000" },
            { work_item_id: 2, prev_approved_cumulative: "25.500" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 102,
              project_id: 1,
              batch_name: "Nghiệm thu tầng 1",
              status: "draft",
              has_negative_delta: false,
              created_by: 10,
            },
          ],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Nghiệm thu tầng 1",
          items: [
            { work_item_id: 1, cumulative_quantity: "100.000" },
            { work_item_id: 2, cumulative_quantity: "75.500" },
            { work_item_id: 3, cumulative_quantity: "30.000" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.items).toHaveLength(3);

      // Số tính tay cứng:
      // Item 1: 100.000 - 60.000 = 40.000
      expect(res.body.items[0].delta_quantity).toBe("40.000");
      // Item 2: 75.500 - 25.500 = 50.000
      expect(res.body.items[1].delta_quantity).toBe("50.000");
      // Item 3: 30.000 - 0.000 = 30.000
      expect(res.body.items[2].delta_quantity).toBe("30.000");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 6: NHIỀU ĐỢT LIÊN TIẾP (LẤY PHIẾU APPROVED GẦN NHẤT)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Nhiều đợt liên tiếp", () => {
    test("TC-6.1: Đợt 3 lấy luỹ kế đã duyệt gần nhất của Đợt 2 (55.000), bỏ qua Đợt 1 (20.000)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 8, unit: "m", is_leaf: true }],
        })
        .mockResolvedValueOnce({
          // DB query ORDER BY created_at DESC LIMIT 1 trả về phiếu approved gần nhất = 55.000
          // (tính tay: 90.000 - 55.000 = 35.000)
          rows: [{ work_item_id: 8, prev_approved_cumulative: "55.000" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 103,
              project_id: 1,
              batch_name: "Đợt 3",
              status: "draft",
              has_negative_delta: false,
              created_by: 10,
            },
          ],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 3",
          items: [{ work_item_id: 8, cumulative_quantity: "90.000" }],
        });

      expect(res.status).toBe(201);
      // Số tính tay cứng:
      expect(res.body.items[0].delta_quantity).toBe("35.000");
      expect(res.body.items[0].prev_approved_cumulative).toBe("55.000");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 7: ĐỢT ÂM (QUYẾT ĐỊNH A)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Xử lý đợt âm theo Quyết định A", () => {
    test("TC-7.1: Luỹ kế mới (40.000) < Đã duyệt (60.000) -> delta = -20.000, has_negative_delta=true", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 9, unit: "m3", is_leaf: true }],
        })
        .mockResolvedValueOnce({
          // Đã duyệt trước là 60.000
          // Tính tay: 40.000 - 60.000 = -20.000
          rows: [{ work_item_id: 9, prev_approved_cumulative: "60.000" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 104,
              project_id: 1,
              batch_name: "Đợt điều chỉnh giảm",
              status: "draft",
              has_negative_delta: true, // Gắn cờ âm
              created_by: 10,
            },
          ],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt điều chỉnh giảm",
          items: [{ work_item_id: 9, cumulative_quantity: "40.000" }],
        });

      expect(res.status).toBe(201);
      // Phiếu được tạo dạng nháp
      expect(res.body.voucher.status).toBe("draft");
      expect(res.body.voucher.has_negative_delta).toBe(true);

      // Số tính tay cứng: delta = -20.000
      expect(res.body.items[0].delta_quantity).toBe("-20.000");
      expect(res.body.items[0].is_negative).toBe(true);

      // Cảnh báo đợt âm trả về
      expect(res.body.warnings).toHaveLength(1);
      expect(res.body.warnings[0].code).toBe("HAS_NEGATIVE_DELTA");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NHÓM 8: KIỂM TRA ĐỊNH DẠNG ẢNH & MAGIC BYTES (BẢO VỆ SERVER)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Upload và xem ảnh hiện trường", () => {
    test("TC-8.1: Upload file giả mạo extension .jpg nhưng magic bytes rác -> 400", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      // Tạo fake buffer không chứa magic bytes hợp lệ
      const fakeCorruptBuffer = Buffer.from("THIS_IS_NOT_AN_IMAGE_FILE");

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/101/photos")
        .attach("photo", fakeCorruptBuffer, {
          filename: "fake_photo.jpg",
          contentType: "image/jpeg",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/không được chấp nhận/i);
    });

    test("TC-8.2: Upload file ảnh JPEG hợp lệ (magic bytes FF D8 FF) -> 201 thành công", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      // Magic bytes JPEG chuẩn: 0xFF, 0xD8, 0xFF, 0xE0 ...
      const validJpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);

      // Check voucher tồn tại
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 101, status: "draft" }],
      });
      // Insert photo
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 501,
            file_name: "valid_site_photo.jpg",
            file_size: validJpegBuffer.length,
            mime_type: "image/jpeg",
            caption: "Ảnh hiện trường cọc móng",
            uploaded_by: 10,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/101/photos")
        .attach("photo", validJpegBuffer, {
          filename: "valid_site_photo.jpg",
          contentType: "image/jpeg",
        })
        .field("caption", "Ảnh hiện trường cọc móng");

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(501);
      expect(res.body.mime_type).toBe("image/jpeg");
      expect(res.body.url).toMatch(/\/photos\/501$/);
    });

    test("TC-8.3: Tải ảnh với tư cách thành viên dự án -> 200 binary", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      const sampleBinary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            file_data: sampleBinary,
            mime_type: "image/jpeg",
            file_name: "site.jpg",
          },
        ],
      });

      const res = await request(app).get(
        "/api/projects/1/acceptance-vouchers/101/photos/501"
      );

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("image/jpeg");
    });
  });
});
