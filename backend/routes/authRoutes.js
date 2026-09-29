// routes/authRoutes.js - Xác thực người dùng
// Đăng ký, đăng nhập, đăng xuất, kiểm tra session.

"use strict";

const express = require("express");
const bcrypt = require("bcrypt");
const argon2 = require("argon2");
const pool = require("../config/db");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// ============================================================
// DUMMY HASH
// Dùng để giảm timing attack khi email không tồn tại
// ============================================================

let DUMMY_HASH = null;

(async () => {
  try {
    DUMMY_HASH = await argon2.hash("dummy-password-for-timing");
  } catch (err) {
    logger.error({ err }, "Không thể khởi tạo dummy hash");
  }
})();

// ============================================================
// ĐĂNG KÝ
// ============================================================

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // Kiểm tra nhập đầy đủ
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }

    // Chuẩn hóa email
    const normalizedEmail = email.trim().toLowerCase();

    // Kiểm tra độ dài email
    if (normalizedEmail.length > 255) {
      return res.status(400).json({
        message: "Email không hợp lệ",
      });
    }

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Email không hợp lệ",
      });
    }

    // Kiểm tra mật khẩu
    if (password.length < 8) {
      return res.status(400).json({
        message: "Mật khẩu phải có ít nhất 8 ký tự",
      });
    }

    if (password.length > 128) {
      return res.status(400).json({
        message: "Mật khẩu không được vượt quá 128 ký tự",
      });
    }

    // Kiểm tra xác nhận mật khẩu
    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Mật khẩu xác nhận không khớp",
      });
    }

    // Kiểm tra email đã tồn tại
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "Email đã được sử dụng",
      });
    }

    // Băm mật khẩu bằng Argon2id
    const passwordHash = await argon2.hash(password);

    // Lấy role mặc định
    const roleResult = await pool.query(
      "SELECT id FROM roles WHERE name = 'ban_quan_ly'"
    );

    if (roleResult.rows.length === 0) {
      return res.status(500).json({
        message: "Lỗi hệ thống: Không tìm thấy vai trò mặc định",
      });
    }

    const defaultRoleId = roleResult.rows[0].id;

    // Chèn user mới
    const result = await pool.query(
      `INSERT INTO users
        (name, email, password_hash, role_id)
       VALUES
        ($1, $2, $3, $4)
       RETURNING id, name, email, created_at`,
      [name, normalizedEmail, passwordHash, defaultRoleId]
    );

    return res.status(201).json({
      message: "Đăng ký tài khoản thành công",
      user: result.rows[0],
    });
  })
);

// ============================================================
// ĐĂNG NHẬP
// ============================================================

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    // Chuẩn hóa email
    const normalizedEmail = email.trim().toLowerCase();

    // Lấy user
    const result = await pool.query(
      `SELECT
         id,
         email,
         password_hash,
         failed_login_attempts,
         locked_until,
         role_id
       FROM users
       WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    // ========================================================
    // EMAIL KHÔNG TỒN TẠI
    // ========================================================

    if (result.rows.length === 0) {
      if (DUMMY_HASH) {
        await argon2.verify(DUMMY_HASH, password).catch(() => { });
      }

      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    const user = result.rows[0];

    // ========================================================
    // KIỂM TRA KHÓA HẾT HẠN
    // ========================================================

    if (
      user.locked_until &&
      new Date(user.locked_until) <= new Date()
    ) {
      await pool.query(
        `UPDATE users
         SET
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
         WHERE id = $1`,
        [user.id]
      );

      user.failed_login_attempts = 0;
      user.locked_until = null;
    }

    // ========================================================
    // KIỂM TRA TÀI KHOẢN ĐANG BỊ KHÓA
    // ========================================================

    if (
      user.locked_until &&
      new Date(user.locked_until) > new Date()
    ) {
      return res.status(423).json({
        message: "Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.",
      });
    }

    // ========================================================
    // KIỂM TRA PASSWORD HASH
    // ========================================================

    if (!user.password_hash) {
      logger.error(
        { userId: user.id },
        "Tài khoản không có password_hash hợp lệ"
      );

      return res.status(500).json({
        message: "Tài khoản chưa có mật khẩu hợp lệ",
      });
    }

    // ========================================================
    // SO SÁNH MẬT KHẨU
    // Hỗ trợ bcrypt cũ và argon2id mới
    // ========================================================

    let passwordCorrect = false;

    const isBcryptHash = user.password_hash.startsWith("$2");

    if (isBcryptHash) {
      // Hash cũ: bcrypt
      passwordCorrect = await bcrypt.compare(
        password,
        user.password_hash
      );

      // Nếu đúng -> nâng cấp lên Argon2
      if (passwordCorrect) {
        try {
          const newHash = await argon2.hash(password);

          await pool.query(
            `UPDATE users
             SET
               password_hash = $1,
               updated_at = NOW()
             WHERE id = $2`,
            [newHash, user.id]
          );

          logger.info(
            { userId: user.id },
            "Đã nâng cấp hash mật khẩu từ bcrypt sang argon2id"
          );
        } catch (rehashErr) {
          logger.warn(
            { err: rehashErr, userId: user.id },
            "Không thể rehash mật khẩu sang argon2id"
          );
        }
      }
    } else {
      // Hash mới: Argon2
      passwordCorrect = await argon2.verify(
        user.password_hash,
        password
      );
    }

    // ========================================================
    // MẬT KHẨU SAI
    //
    // Dùng transaction + SELECT FOR UPDATE để xử lý
    // trường hợp nhiều request sai mật khẩu chạy song song.
    //
    // 10 lần sai -> khóa 15 phút
    // Request thứ 11 -> 423
    // ========================================================

    if (!passwordCorrect) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Khóa row hiện tại để các request song song
        // phải xử lý lần lượt.
        const lockedUserResult = await client.query(
          `SELECT
             id,
             email,
             password_hash,
             failed_login_attempts,
             locked_until,
             role_id
           FROM users
           WHERE id = $1
           FOR UPDATE`,
          [user.id]
        );

        if (lockedUserResult.rows.length === 0) {
          await client.query("ROLLBACK");

          return res.status(401).json({
            message: "Email hoặc mật khẩu không đúng",
          });
        }

        const currentUser = lockedUserResult.rows[0];

        // Nếu khóa đã hết hạn -> reset
        if (
          currentUser.locked_until &&
          new Date(currentUser.locked_until) <= new Date()
        ) {
          await client.query(
            `UPDATE users
             SET
               failed_login_attempts = 0,
               locked_until = NULL,
               updated_at = NOW()
             WHERE id = $1`,
            [user.id]
          );

          currentUser.failed_login_attempts = 0;
          currentUser.locked_until = null;
        }

        // Nếu tài khoản đang bị khóa
        if (
          currentUser.locked_until &&
          new Date(currentUser.locked_until) > new Date()
        ) {
          await client.query("COMMIT");

          return res.status(423).json({
            message:
              "Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.",
          });
        }

        // Tăng số lần đăng nhập sai
        const newFailedAttempts =
          Number(currentUser.failed_login_attempts || 0) + 1;

        // Đủ 10 lần -> khóa
        const shouldLock = newFailedAttempts >= 10;

        let updateResult;

        if (shouldLock) {
          updateResult = await client.query(
            `UPDATE users
             SET
               failed_login_attempts = $1,
               locked_until = NOW() + INTERVAL '15 minutes',
               updated_at = NOW()
             WHERE id = $2
             RETURNING failed_login_attempts, locked_until`,
            [newFailedAttempts, user.id]
          );
        } else {
          updateResult = await client.query(
            `UPDATE users
             SET
               failed_login_attempts = $1,
               locked_until = NULL,
               updated_at = NOW()
             WHERE id = $2
             RETURNING failed_login_attempts, locked_until`,
            [newFailedAttempts, user.id]
          );
        }

        await client.query("COMMIT");

        const updatedUser = updateResult.rows[0];

        // Nếu vừa đạt 10 lần -> trả 423
        if (updatedUser && updatedUser.locked_until) {
          logger.warn(
            { userId: user.id },
            "Tài khoản bị khóa sau 10 lần đăng nhập sai"
          );

          return res.status(423).json({
            message:
              "Tài khoản đã bị khóa tạm thời. Vui lòng thử lại sau.",
          });
        }

        // Chưa đủ 10 lần
        return res.status(401).json({
          message: "Email hoặc mật khẩu không đúng",
        });
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          logger.error(
            { err: rollbackErr },
            "Không thể rollback transaction"
          );
        }

        throw err;
      } finally {
        client.release();
      }
    }

    // ========================================================
    // ĐĂNG NHẬP THÀNH CÔNG
    // ========================================================

    // Reset bộ đếm sai
    await pool.query(
      `UPDATE users
       SET
         failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // ========================================================
    // LẤY ROLE
    // ========================================================

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
      logger.warn(
        { err: roleErr },
        "Không thể lấy tên vai trò"
      );
    }

    // ========================================================
    // REGENERATE SESSION
    // Chống session fixation
    // ========================================================

    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    req.session.user = {
      id: user.id,
      email: user.email,
      role: roleName,
    };

    // ========================================================
    // RESPONSE
    // ========================================================

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

// ============================================================
// KIỂM TRA SESSION
// ============================================================

router.get("/me", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      message: "Chưa đăng nhập",
    });
  }

  return res.status(200).json({
    user: req.session.user,
  });
});

// ============================================================
// ĐĂNG XUẤT
// ============================================================

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (!req.session) {
      return res.status(200).json({
        message: "Đăng xuất thành công",
      });
    }

    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    res.clearCookie("cmp.sid", {
      path: "/",
    });

    return res.status(200).json({
      message: "Đăng xuất thành công",
    });
  })
);

module.exports = router;