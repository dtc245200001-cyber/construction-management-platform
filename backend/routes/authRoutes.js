const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");

const router = express.Router();

// =========================
// ĐĂNG NHẬP
// =========================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    // Tìm user + để PostgreSQL xác định tài khoản còn bị khóa hay không
    const result = await pool.query(
      `SELECT *,
              CASE
                WHEN locked_until IS NOT NULL
                     AND locked_until > NOW()
                THEN TRUE
                ELSE FALSE
              END AS is_locked
       FROM users
       WHERE email = $1`,
      [email]
    );

    // Không tiết lộ email có tồn tại hay không
    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    const user = result.rows[0];

    // Đang trong 15 phút khóa -> không kiểm tra mật khẩu
    if (user.is_locked) {
      return res.status(423).json({
        message: "Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.",
      });
    }

    const passwordCorrect = await bcrypt.compare(
      password,
      user.password_hash
    );

    // =========================
    // MẬT KHẨU SAI
    // =========================
    if (!passwordCorrect) {
      const newAttempts = user.failed_login_attempts + 1;

      // Sai lần thứ 5 -> khóa 15 phút
      if (newAttempts >= 5) {
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = 5,
               locked_until = NOW() + INTERVAL '15 minutes',
               updated_at = NOW()
           WHERE id = $1`,
          [user.id]
        );

        return res.status(423).json({
          message: "Đăng nhập sai quá 5 lần. Tài khoản bị khóa 15 phút.",
        });
      }

      // Sai lần 1 -> 4
      await pool.query(
        `UPDATE users
         SET failed_login_attempts = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [newAttempts, user.id]
      );

      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    // =========================
    // MẬT KHẨU ĐÚNG
    // =========================

    // Nếu thời gian khóa cũ đã hết -> cho đăng nhập và reset
    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    req.session.user = {
      id: user.id,
      email: user.email,
    };

    return res.json({
      message: "Đăng nhập thành công",
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
});

// =========================
// KIỂM TRA SESSION
// =========================
router.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Chưa đăng nhập",
    });
  }

  return res.json({
    user: req.session.user,
  });
});

// =========================
// ĐĂNG XUẤT
// =========================
router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("LOGOUT ERROR:", error);

      return res.status(500).json({
        message: "Đăng xuất thất bại",
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      message: "Đăng xuất thành công",
    });
  });
});

module.exports = router;