const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");

const router = express.Router();

// ======================================================
// ĐĂNG KÝ
// ======================================================
router.post("/register", async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    // Kiểm tra nhập đầy đủ
    if (!email || !password || !confirmPassword) {
      return res.status(400).json({
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }

    // Chuẩn hóa email
    const normalizedEmail = email.trim().toLowerCase();

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Email không hợp lệ",
      });
    }

    // Kiểm tra mật khẩu
    if (password.length < 6) {
      return res.status(400).json({
        message: "Mật khẩu phải có ít nhất 6 ký tự",
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
      `SELECT id
       FROM users
       WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "Email đã được sử dụng",
      });
    }

    // Mã hóa mật khẩu
    const passwordHash = await bcrypt.hash(password, 10);

    // ======================================================
    // THÊM USER
    // Bảng users hiện tại:
    // - không có name
    // - không có password
    // - không có role_id
    // ======================================================
    const result = await pool.query(
      `INSERT INTO users (
        email,
        password_hash
      )
      VALUES ($1, $2)
      RETURNING id, email, created_at`,
      [normalizedEmail, passwordHash]
    );

    return res.status(201).json({
      message: "Đăng ký tài khoản thành công",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    // Email trùng
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Email đã được sử dụng",
      });
    }

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
});

// ======================================================
// ĐĂNG NHẬP
// ======================================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kiểm tra nhập đầy đủ
    if (!email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    // Chuẩn hóa email
    const normalizedEmail = email.trim().toLowerCase();

    // Tìm user
    const result = await pool.query(
      `SELECT *
       FROM users
       WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    const user = result.rows[0];

    // ======================================================
    // KIỂM TRA KHÓA TÀI KHOẢN
    // ======================================================
    if (
      user.locked_until &&
      new Date(user.locked_until).getTime() > Date.now()
    ) {
      return res.status(423).json({
        message:
          "Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.",
      });
    }

    // ======================================================
    // KIỂM TRA PASSWORD HASH
    // ======================================================
    if (!user.password_hash) {
      console.error(
        "LOGIN ERROR: User không có password_hash:",
        user.id
      );

      return res.status(500).json({
        message: "Tài khoản chưa có mật khẩu hợp lệ",
      });
    }

    // So sánh mật khẩu
    const passwordCorrect = await bcrypt.compare(
      password,
      user.password_hash
    );

    // ======================================================
    // MẬT KHẨU SAI
    // ======================================================
    if (!passwordCorrect) {
      const currentAttempts =
        Number(user.failed_login_attempts) || 0;

      const newAttempts = currentAttempts + 1;

      // Sai từ lần thứ 5
      if (newAttempts >= 5) {
        try {
          await pool.query(
            `UPDATE users
             SET failed_login_attempts = 5,
                 locked_until = NOW() + INTERVAL '15 minutes',
                 updated_at = NOW()
             WHERE id = $1`,
            [user.id]
          );

          return res.status(423).json({
            message:
              "Đăng nhập sai quá 5 lần. Tài khoản bị khóa 15 phút.",
          });
        } catch (lockError) {
          console.error(
            "LOGIN LOCK UPDATE ERROR:",
            lockError.message
          );

          return res.status(401).json({
            message: "Email hoặc mật khẩu không đúng",
          });
        }
      }

      // Sai lần 1 -> 4
      try {
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [newAttempts, user.id]
        );
      } catch (attemptError) {
        console.error(
          "LOGIN ATTEMPT UPDATE ERROR:",
          attemptError.message
        );
      }

      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    // ======================================================
    // ĐĂNG NHẬP THÀNH CÔNG
    // ======================================================

    // Reset số lần đăng nhập sai
    try {
      await pool.query(
        `UPDATE users
         SET failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [user.id]
      );
    } catch (resetError) {
      console.error(
        "LOGIN RESET ERROR:",
        resetError.message
      );
    }

    // Tạo session
    req.session.user = {
      id: user.id,
      email: user.email,
    };

    return res.status(200).json({
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

// ======================================================
// KIỂM TRA SESSION
// ======================================================
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

// ======================================================
// ĐĂNG XUẤT
// ======================================================
router.post("/logout", (req, res) => {
  if (!req.session) {
    return res.status(200).json({
      message: "Đăng xuất thành công",
    });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("LOGOUT ERROR:", error);

      return res.status(500).json({
        message: "Đăng xuất thất bại",
      });
    }

    res.clearCookie("connect.sid");

    return res.status(200).json({
      message: "Đăng xuất thành công",
    });
  });
});

module.exports = router;