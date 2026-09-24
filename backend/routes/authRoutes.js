// routes/authRoutes.js — Xác thực người dùng (đăng ký, đăng nhập, đăng xuất, kiểm tra session).
//
// Bảo mật áp dụng:
//   - Mật khẩu băm bằng argon2id (NFR E-02 / S-02).
//   - Rehash bcrypt → argon2id tự động khi user cũ đăng nhập (backward compat).
//   - Khoá tài khoản sau 5 lần sai: UPDATE atomic, reset khi hết hạn khoá.
//   - Timing equalization: email không tồn tại vẫn chạy verify giả để
//     thời gian phản hồi tương đương email có tồn tại (giảm timing attack).
//   - session.regenerate() sau đăng nhập thành công (ngăn session fixation).

"use strict";

const express = require("express");
const bcrypt = require("bcrypt"); // Giữ lại để verify hash cũ; sẽ bỏ khi DB không còn bcrypt hash
const argon2 = require("argon2");
const pool = require("../config/db");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// ─── KHỞI ĐỘNG: DUMMY HASH & ROLE ID ─────────────────────────────────────────
//
// Tính sẵn hash giả để dùng trong timing equalization khi email không tồn tại.
let DUMMY_HASH = null;

(async () => {
  try {
    DUMMY_HASH = await argon2.hash("dummy-password-for-timing");
  } catch (err) {
    logger.error({ err }, "Không thể khởi tạo dummy hash");
  }
})();

// ─── ĐĂNG KÝ ─────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - confirmPassword
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       201:
 *         description: Đăng ký tài khoản thành công
 *       400:
 *         description: Thông tin không hợp lệ
 */
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // Kiểm tra nhập đầy đủ
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
    }

    // Chuẩn hóa email
    const normalizedEmail = email.trim().toLowerCase();

    // Kiểm tra độ dài email
    if (normalizedEmail.length > 255) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }

    // Kiểm tra mật khẩu (đồng bộ với frontend: tối thiểu 8, tối đa 128 ký tự)
    if (password.length < 8) {
      return res.status(400).json({ message: "Mật khẩu phải có ít nhất 8 ký tự" });
    }
    if (password.length > 128) {
      return res.status(400).json({ message: "Mật khẩu không được vượt quá 128 ký tự" });
    }

    // Kiểm tra xác nhận mật khẩu
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Mật khẩu xác nhận không khớp" });
    }

    // Kiểm tra email đã tồn tại (index lower(email) đảm bảo tốc độ)
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Email đã được sử dụng" });
    }

    // Băm mật khẩu bằng argon2id
    const passwordHash = await argon2.hash(password);

    // Lấy role mặc định động để tránh lỗi khi test/khởi động
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly'");
    if (roleResult.rows.length === 0) {
      return res.status(500).json({ message: "Lỗi hệ thống: Không tìm thấy vai trò mặc định" });
    }
    const defaultRoleId = roleResult.rows[0].id;

    // Chèn user mới (không ghi cột password cũ — xem migration 1790200000001)
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, created_at`,
      [name, normalizedEmail, passwordHash, defaultRoleId]
    );

    return res.status(201).json({
      message: "Đăng ký tài khoản thành công",
      user: result.rows[0],
    });
  })
);

// ─── ĐĂNG NHẬP ───────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập hệ thống
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về cookie cmp.sid
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Vui lòng nhập email và mật khẩu" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Chỉ lấy các cột cần thiết (không SELECT *)
    const result = await pool.query(
      `SELECT id, email, password_hash, failed_login_attempts, locked_until, role_id
       FROM users
       WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    // ── Timing equalization: email không tồn tại vẫn chạy verify giả ──────────
    if (result.rows.length === 0) {
      if (DUMMY_HASH) {
        await argon2.verify(DUMMY_HASH, password).catch(() => {});
      }
      return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
    }

    const user = result.rows[0];

    // ── Reset khi khoá đã hết hạn ─────────────────────────────────────────────
    if (user.locked_until && new Date(user.locked_until) <= new Date()) {
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
        [user.id]
      );
      user.failed_login_attempts = 0;
      user.locked_until = null;
    }

    // ── Kiểm tra khoá tài khoản ───────────────────────────────────────────────
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        message: "Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.",
      });
    }

    // ── Kiểm tra password_hash ────────────────────────────────────────────────
    if (!user.password_hash) {
      logger.error({ userId: user.id }, "Tài khoản không có password_hash hợp lệ");
      return res.status(500).json({ message: "Tài khoản chưa có mật khẩu hợp lệ" });
    }

    // ── So sánh mật khẩu (hỗ trợ cả bcrypt và argon2id) ─────────────────────
    let passwordCorrect = false;
    const isBcryptHash = user.password_hash.startsWith("$2");

    if (isBcryptHash) {
      // Hash cũ: verify bằng bcrypt
      passwordCorrect = await bcrypt.compare(password, user.password_hash);

      // Rehash on login: nếu đúng → nâng cấp sang argon2id
      if (passwordCorrect) {
        try {
          const newHash = await argon2.hash(password);
          await pool.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [newHash, user.id]
          );
          logger.info({ userId: user.id }, "Đã nâng cấp hash mật khẩu từ bcrypt sang argon2id");
        } catch (rehashErr) {
          // Không dừng đăng nhập nếu rehash lỗi — chỉ log
          logger.warn({ err: rehashErr, userId: user.id }, "Không thể rehash mật khẩu sang argon2id");
        }
      }
    } else {
      // Hash mới: verify bằng argon2
      passwordCorrect = await argon2.verify(user.password_hash, password);
    }

    // ── Mật khẩu sai ─────────────────────────────────────────────────────────
    if (!passwordCorrect) {
      // Atomic increment: một câu UPDATE, RETURNING để đọc giá trị mới
      const { rows } = await pool.query(
        `UPDATE users
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE
               WHEN failed_login_attempts + 1 >= 5
               THEN NOW() + INTERVAL '15 minutes'
               ELSE locked_until
             END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING failed_login_attempts, locked_until`,
        [user.id]
      );

      if (rows[0] && rows[0].locked_until) {
        logger.warn({ userId: user.id }, "Tài khoản bị khóa sau nhiều lần đăng nhập sai");
        return res.status(423).json({
          message: "Đăng nhập sai quá 5 lần. Tài khoản bị khóa 15 phút.",
        });
      }

      return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
    }

    // ── Đăng nhập thành công ──────────────────────────────────────────────────

    // Reset bộ đếm sai
    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Lấy tên vai trò hệ thống để đưa vào session
    let roleName = null;
    try {
      const roleResult = await pool.query(
        "SELECT name FROM roles WHERE id = $1",
        [user.role_id]
      );
      if (roleResult.rows.length > 0) {
        roleName = roleResult.rows[0].name;
      }
    } catch (roleErr) {
      logger.warn({ err: roleErr }, "Không thể lấy tên vai trò");
    }

    // session.regenerate() ngăn session fixation attack
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.user = {
      id: user.id,
      email: user.email,
      role: roleName,
    };

    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: {
        id: user.id,
        email: user.email,
        role: roleName,
      },
    });
  })
);

// ─── KIỂM TRA SESSION ────────────────────────────────────────────────────────
router.get("/me", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }
  return res.status(200).json({ user: req.session.user });
});

// ─── ĐĂNG XUẤT ───────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Đăng xuất hệ thống
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công, xóa cookie session
 */
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (!req.session) {
      return res.status(200).json({ message: "Đăng xuất thành công" });
    }

    await new Promise((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });

    // Xóa cookie cmp.sid với cùng options đã đặt (sameSite, path)
    res.clearCookie("cmp.sid", { path: "/" });

    return res.status(200).json({ message: "Đăng xuất thành công" });
  })
);

module.exports = router;