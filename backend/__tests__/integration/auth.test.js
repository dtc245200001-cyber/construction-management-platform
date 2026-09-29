const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const bcrypt = require("bcrypt");

describe("Auth Integration Tests", () => {
  let server;

  beforeAll((done) => {
    server = app.listen(0, done);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE users, roles RESTART IDENTITY CASCADE");
    await pool.query("TRUNCATE session RESTART IDENTITY CASCADE");

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
  });

  describe("B1. Đăng ký", () => {
    it("Đăng ký hợp lệ, không ghi cột password", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test",
          email: "test@example.com",
          password: "Password123",
          confirmPassword: "Password123",
        });

      expect(res.status).toBe(201);

      const { rows } = await pool.query(
        "SELECT * FROM users WHERE email='test@example.com'"
      );

      expect(rows[0].password).toBeNull();
      expect(rows[0].password_hash).toMatch(/^\$argon2/);
    });

    it("Email trùng khác hoa/thường bị chặn", async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test 1",
          email: "TeSt@example.com",
          password: "Password123",
          confirmPassword: "Password123",
        });

      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test 2",
          email: "tEsT@example.com",
          password: "Password123",
          confirmPassword: "Password123",
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Email/);
    });

    it("Mật khẩu ngắn/dài bị chặn", async () => {
      const res1 = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test",
          email: "a@a.com",
          password: "short",
          confirmPassword: "short",
        });

      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test",
          email: "b@b.com",
          password: "a".repeat(129),
          confirmPassword: "a".repeat(129),
        });

      expect(res2.status).toBe(400);
    });
  });

  describe("B2, B3, B4, B5. Đăng nhập, Khóa tài khoản, Rehash, Session", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test",
          email: "test@example.com",
          password: "Password123",
          confirmPassword: "Password123",
        });
    });

    it("B2. Đăng nhập đúng/sai, thông báo chung", async () => {
      const res1 = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "wrong",
        });

      expect(res1.status).toBe(401);
      expect(res1.body.message).toBe("Email hoặc mật khẩu không đúng");

      const res2 = await request(app)
        .post("/api/auth/login")
        .send({
          email: "notexist@example.com",
          password: "wrong",
        });

      expect(res2.status).toBe(401);
      expect(res2.body.message).toBe("Email hoặc mật khẩu không đúng");
    });

    it("B3. Sai 10 lần -> tài khoản bị khóa và trả 423", async () => {
      // Gửi sai lần lượt 10 lần
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .send({
            email: "test@example.com",
            password: "wrong",
          });

        // 9 lần đầu trả 401
        if (i < 9) {
          expect(res.status).toBe(401);
        }

        // Lần thứ 10 tài khoản bị khóa -> 423
        if (i === 9) {
          expect(res.status).toBe(423);
        }
      }

      // Kiểm tra tài khoản đã bị khóa trong database
      const { rows } = await pool.query(
        "SELECT failed_login_attempts, locked_until FROM users WHERE email='test@example.com'"
      );

      expect(rows[0].failed_login_attempts).toBe(10);
      expect(rows[0].locked_until).not.toBeNull();

      // Đưa thời gian khóa về quá khứ để giả lập hết thời gian khóa
      await pool.query(
        "UPDATE users SET locked_until = NOW() - INTERVAL '1 day' WHERE email='test@example.com'"
      );

      // Sai thêm 1 lần sau khi hết khóa
      const resAfterUnlock = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "wrong",
        });

      expect(resAfterUnlock.status).toBe(401);

      // Sau khi hết khóa, bộ đếm phải quay về 1
      const { rows: rows2 } = await pool.query(
        "SELECT failed_login_attempts, locked_until FROM users WHERE email='test@example.com'"
      );

      expect(rows2[0].failed_login_attempts).toBe(1);
      expect(rows2[0].locked_until).toBeNull();
    });

    it("B4. Rehash từ bcrypt", async () => {
      const hash = await bcrypt.hash("Password123", 10);

      await pool.query(
        "UPDATE users SET password_hash = $1 WHERE email='test@example.com'",
        [hash]
      );

      await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password123",
        });

      const { rows } = await pool.query(
        "SELECT password_hash FROM users WHERE email='test@example.com'"
      );

      expect(rows[0].password_hash).toMatch(/^\$argon2/);
    });

    it("B5. Session persistence, HttpOnly, Max-Age", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password123",
        });

      expect(res.status).toBe(200);

      const cookies = res.headers["set-cookie"][0];

      expect(cookies).toMatch(/HttpOnly/);
      expect(cookies).toMatch(/Expires=/);

      // Đăng nhập lại để kiểm tra session được regenerate
      const res2 = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "Password123",
        });

      const cookies2 = res2.headers["set-cookie"][0];

      expect(cookies).not.toBe(cookies2);
    });
  });
});