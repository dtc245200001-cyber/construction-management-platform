const request = require("supertest");
const crypto = require("crypto");
const app = require("../../app");
const pool = require("../../config/db");

jest.mock("../../lib/mailer", () => ({
  sendEmail: jest.fn().mockResolvedValue({ status: "sent", messageId: "test-id" }),
  maskEmail: jest.requireActual("../../lib/mailer").maskEmail,
  memoryInbox: [],
}));

const { sendEmail } = require("../../lib/mailer");

describe("Password Reset Integration Tests (test DB only)", () => {
  let server;

  beforeAll((done) => {
    server = app.listen(0, done);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE password_reset_tokens, users, roles RESTART IDENTITY CASCADE"
    );
    await pool.query(`
      INSERT INTO roles (name)
      VALUES
        ('chu_dau_tu'),
        ('ban_quan_ly'),
        ('ky_su_giam_sat'),
        ('chi_huy_truong'),
        ('doi_truong'),
        ('ke_toan')
    `);
    jest.clearAllMocks();
  });

  async function createUser(email = "reset@example.com") {
    const roleRes = await pool.query("SELECT id FROM roles WHERE name = 'doi_truong'");
    const userRes = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_verified) VALUES ($1, $2, $3, $4, true) RETURNING id",
      [email, email, "hash", roleRes.rows[0].id]
    );
    return userRes.rows[0].id;
  }

  it("forgot-password luôn trả thông báo trung lập, kể cả email không tồn tại", async () => {
    const missing = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "khong-ton-tai@example.com" });
    expect(missing.status).toBe(200);
    expect(missing.body.message).toMatch(/tài khoản hợp lệ/);

    const invalid = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "sai-dinh-dang" });
    expect(invalid.status).toBe(200);
    expect(invalid.body.message).toMatch(/tài khoản hợp lệ/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("forgot-password tạo token hash và gửi email, không lưu token thật", async () => {
    await createUser();
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "reset@example.com" });

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const { rows } = await pool.query("SELECT * FROM password_reset_tokens");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toHaveLength(64);
    expect(rows[0].used_at).toBeNull();

    // Email không được chứa token hash (chỉ chứa link reset có token thật).
    expect(JSON.stringify(sendEmail.mock.calls[0])).not.toContain(rows[0].token_hash);
  });

  it("reset-password từ chối token sai/hết hạn và mật khẩu không khớp", async () => {
    const badToken = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "sai", password: "Password123", confirmPassword: "Password123" });
    expect(badToken.status).toBe(400);

    const mismatch = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "sai", password: "Password123", confirmPassword: "Khac12345" });
    expect(mismatch.status).toBe(400);

    const short = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "sai", password: "short", confirmPassword: "short" });
    expect(short.status).toBe(400);
  });

  it("reset-password thành công, đánh dấu đã dùng và không tái sử dụng được", async () => {
    const userId = await createUser();
    const token = "a".repeat(64);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')",
      [userId, tokenHash]
    );

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "PasswordMoi123", confirmPassword: "PasswordMoi123" });
    expect(res.status).toBe(200);

    const used = await pool.query("SELECT used_at FROM password_reset_tokens");
    expect(used.rows[0].used_at).not.toBeNull();

    const reuse = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "PasswordKhac123", confirmPassword: "PasswordKhac123" });
    expect(reuse.status).toBe(400);

    // Đăng nhập được bằng mật khẩu mới.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "reset@example.com", password: "PasswordMoi123" });
    expect(login.status).toBe(200);
  });

  it("google/status trả configured=false khi chưa cấu hình, google redirect an toàn", async () => {
    const status = await request(app).get("/api/auth/google/status");
    expect(status.status).toBe(200);
    expect(status.body.configured).toBe(false);

    const start = await request(app).get("/api/auth/google");
    expect(start.status).toBe(302);
    expect(start.headers.location).toMatch(/^\/login\?oauth_error=google_not_configured$/);

    const callback = await request(app).get("/api/auth/google/callback?code=x&state=y");
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toMatch(/^\/login\?oauth_error=/);
  });
});
