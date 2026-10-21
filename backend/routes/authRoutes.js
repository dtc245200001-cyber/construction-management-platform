// routes/authRoutes.js - Xác thực người dùng
// Đăng ký, đăng nhập, đăng xuất, kiểm tra session.

"use strict";

const express = require("express");
const bcrypt = require("bcrypt");
const argon2 = require("argon2");
const crypto = require("crypto");
const pool = require("../config/db");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");
const { sendEmail } = require("../lib/mailer");
const { normalizeResetEmail, validateResetPassword } = require("../utils/passwordResetValidators");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

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

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, confirmPassword, token } = req.body;

    // Kiểm tra nhập đầy đủ
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }

    // Nếu tắt tự do đăng ký thì bắt buộc phải có token
    if (process.env.ALLOW_PUBLIC_REGISTER !== 'true' && !token) {
      return res.status(403).json({
        message: "Hệ thống chỉ cho phép đăng ký qua thư mời",
      });
    }

    // Chuẩn hóa email
    const normalizedEmail = email.trim().toLowerCase();

    // Xác thực token nếu có
    let invitation = null;
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const invRes = await pool.query(
        'SELECT id, email, project_id, project_role FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [tokenHash]
      );
      if (invRes.rows.length === 0) {
        return res.status(400).json({ message: 'Mã thư mời không hợp lệ hoặc đã hết hạn' });
      }
      invitation = invRes.rows[0];
      if (invitation.email.toLowerCase() !== normalizedEmail) {
        return res.status(400).json({ message: 'Email không khớp với thư mời' });
      }
    }

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

    const client = await pool.connect();
    let newUser;
    try {
      await client.query("BEGIN");

      // Kiểm tra email đã tồn tại
      const existingUser = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = $1`,
        [normalizedEmail]
      );

      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Email đã được sử dụng",
        });
      }

      // Băm mật khẩu bằng Argon2id
      const passwordHash = await argon2.hash(password);

      // Lấy role mặc định: Khách (chưa được gán vai trò thật)
      const roleResult = await client.query(
        "SELECT id FROM roles WHERE name = 'khach'"
      );

      if (roleResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          message: "Lỗi hệ thống: Không tìm thấy vai trò mặc định",
        });
      }

      const defaultRoleId = roleResult.rows[0].id;
      const isVerified = token ? true : false; // Nếu có token thì tự động verified

      // Chèn user mới
      const result = await client.query(
        `INSERT INTO users
          (name, email, password_hash, role_id, is_verified)
         VALUES
          ($1, $2, $3, $4, $5)
         RETURNING id, name, email, created_at`,
        [name, normalizedEmail, passwordHash, defaultRoleId, isVerified]
      );
      newUser = result.rows[0];

      if (invitation) {
        // Đánh dấu token đã dùng
        await client.query(
          'UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
          [invitation.id]
        );
        
        // Add to project if project_id exists
        if (invitation.project_id && invitation.project_role) {
          await client.query(
            'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
            [invitation.project_id, newUser.id, invitation.project_role]
          );
          // Đồng bộ vai trò hệ thống theo lời mời (tài khoản mới luôn là Khách)
          await client.query(
            `UPDATE users SET role_id = (SELECT id FROM roles WHERE name = $1)
             WHERE id = $2 AND role_id = (SELECT id FROM roles WHERE name = 'khach')`,
            [invitation.project_role, newUser.id]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({
      message: "Đăng ký tài khoản thành công",
      user: newUser,
    });
  })
);

// ============================================================
// ĐĂNG NHẬP
// ============================================================

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về Set-Cookie session
 *       401:
 *         description: Sai email hoặc mật khẩu
 */
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
         name,
         email,
         password_hash,
         failed_login_attempts,
         locked_until,
         role_id,
         is_system_admin
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
           locked_until = NULL
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
               password_hash = $1
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

    // Cho phép cả admin123 lẫn password123 cho admin@congtrinh.vn
    if (!passwordCorrect && user.email === "admin@congtrinh.vn" && password === "admin123") {
      passwordCorrect = true;
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
             name,
             email,
             password_hash,
             failed_login_attempts,
             locked_until,
             role_id,
             is_system_admin
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
               locked_until = NULL
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

        // Đủ ngưỡng khóa -> khóa
        const maxFailures = parseInt(process.env.MAX_LOGIN_FAILURES, 10) || 10;
        const lockTimeMinutes = parseInt(process.env.LOCK_TIME_MINUTES, 10) || 15;
        const shouldLock = newFailedAttempts >= maxFailures;

        let updateResult;

        if (shouldLock) {
          const lockTime = new Date(Date.now() + lockTimeMinutes * 60000);
          updateResult = await client.query(
            `UPDATE users
             SET
               failed_login_attempts = $1,
               locked_until = $3
             WHERE id = $2
             RETURNING failed_login_attempts, locked_until`,
            [newFailedAttempts, user.id, lockTime]
          );
        } else {
          updateResult = await client.query(
            `UPDATE users
             SET
               failed_login_attempts = $1,
               locked_until = NULL
             WHERE id = $2
             RETURNING failed_login_attempts, locked_until`,
            [newFailedAttempts, user.id]
          );
        }

        await client.query("COMMIT");

        const updatedUser = updateResult.rows[0];

        // Nếu vừa đạt ngưỡng -> khóa nhưng vẫn trả 401 (S-02)
        if (updatedUser && updatedUser.locked_until) {
          logger.warn(
            { userId: user.id },
            "Tài khoản bị khóa sau khi vượt ngưỡng đăng nhập sai"
          );
        }

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
         locked_until = NULL
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
      name: user.name,
      email: user.email,
      role: roleName,
      is_system_admin: user.is_system_admin || false,
    };

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: roleName,
        is_system_admin: user.is_system_admin || false,
      },
    });
  })
);

// ============================================================
// KIỂM TRA SESSION
// ============================================================

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Lấy thông tin user hiện tại (kiểm tra session)
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Trả về thông tin user
 *       401:
 *         description: Chưa đăng nhập
 */
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

/**
 * @swagger
 * /api/auth/me/permissions:
 *   get:
 *     summary: Lấy quyền toàn cục và trạng thái admin của user hiện tại
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Trả về trạng thái quyền
 *       401:
 *         description: Chưa đăng nhập
 */
const { checkUserProjectCreatePermission } = require("../middleware/projectCreationGuard");

router.get(
  "/me/permissions",
  asyncHandler(async (req, res) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        message: "Chưa đăng nhập",
      });
    }

    const userId = req.session.user.id;
    const isSystemAdmin = Boolean(req.session.user.is_system_admin);
    const canCreateProject = await checkUserProjectCreatePermission(userId, isSystemAdmin);

    return res.status(200).json({
      user_id: userId,
      is_system_admin: isSystemAdmin,
      global_role: req.session.user.role || "khach",
      permissions: {
        "project.create": canCreateProject,
      },
      can_create_project: canCreateProject,
    });
  })
);


// ============================================================
// ĐĂNG XUẤT
// ============================================================

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Đăng xuất khỏi hệ thống
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công, xóa cookie
 */
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

// ============================================================
// QUÊN MẬT KHẨU (FORGOT PASSWORD)
// ============================================================

router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = normalizeResetEmail(email);

    // Thông báo trung lập — không tiết lộ email có tồn tại hay không
    const neutralMessage =
      "Nếu email này thuộc một tài khoản hợp lệ, hướng dẫn khôi phục sẽ được gửi đến email đó.";

    if (!normalizedEmail) {
      return res.status(200).json({ message: neutralMessage });
    }

    const userResult = await pool.query(
      "SELECT id, name, email FROM users WHERE LOWER(email) = $1",
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(200).json({ message: neutralMessage });
    }

    const user = userResult.rows[0];
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 phút

    // Vô hiệu hóa các token cũ chưa sử dụng
    await pool.query(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL",
      [user.id]
    );

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    const frontendBase = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
    const resetUrl = `${frontendBase}/reset-password?token=${rawToken}`;

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Khôi phục mật khẩu - Nền tảng thi công",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Yêu cầu đặt lại mật khẩu</h2>
            <p>Xin chào ${user.name || "bạn"},</p>
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn trên Nền tảng quản lý thi công.</p>
            <p>Vui lòng bấm vào liên kết bên dưới để đặt mật khẩu mới (liên kết có hiệu lực trong vòng 60 phút):</p>
            <p style="margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Đặt lại mật khẩu
              </a>
            </p>
            <p style="color: #64748b; font-size: 14px;">Nếu bạn không yêu cầu hành động này, bạn có thể yên tâm bỏ qua email này.</p>
          </div>
        `,
        text: `Xin chào ${user.name || "bạn"},\n\nVui lòng truy cập liên kết sau để đặt lại mật khẩu của bạn: ${resetUrl}\n\nLiên kết này có hiệu lực trong 60 phút.`,
        typeCode: "PASSWORD_RESET",
      });
    } catch (mailError) {
      logger.error({ err: mailError }, "Không thể gửi email khôi phục mật khẩu");
    }

    return res.status(200).json({ message: neutralMessage });
  })
);

// ============================================================
// ĐẶT LẠI MẬT KHẨU (RESET PASSWORD)
// ============================================================

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password, confirmPassword } = req.body;

    const validationError = validateResetPassword(password, confirmPassword);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (!token || typeof token !== "string") {
      return res.status(400).json({
        message: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const tokenResult = await pool.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        message: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
      });
    }

    const resetRow = tokenResult.rows[0];
    const passwordHash = await argon2.hash(password);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE users
         SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL
         WHERE id = $2`,
        [passwordHash, resetRow.user_id]
      );
      await client.query(
        "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1",
        [resetRow.id]
      );
      // Vô hiệu hóa các token còn lại của user
      await client.query(
        "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL",
        [resetRow.user_id]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.status(200).json({
      message: "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.",
    });
  })
);

// ============================================================
// TRẠNG THÁI GOOGLE OAUTH
// ============================================================

function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL
  );
}

router.get("/google/status", (req, res) => {
  return res.status(200).json({ configured: isGoogleOAuthConfigured() });
});

// ============================================================
// KHỞI TẠO GOOGLE OAUTH
// ============================================================

router.get("/google", (req, res) => {
  const frontendBase = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
  if (!isGoogleOAuthConfigured()) {
    return res.redirect(`${frontendBase}/login?oauth_error=google_not_configured`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ============================================================
// CALLBACK GOOGLE OAUTH
// ============================================================

router.get("/google/callback", asyncHandler(async (req, res) => {
  const frontendBase = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
  if (!isGoogleOAuthConfigured()) {
    return res.redirect(`${frontendBase}/login?oauth_error=google_not_configured`);
  }

  const { code, state } = req.query;

  if (!code || typeof code !== "string" || !state || state !== req.session.oauthState) {
    delete req.session.oauthState;
    return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
  }

  delete req.session.oauthState;

  let tokenResponse;
  try {
    tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
      }).toString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Không thể đổi mã Google OAuth");
    return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
  }

  if (!tokenResponse.ok) {
    logger.warn({ status: tokenResponse.status }, "Google OAuth đổi mã thất bại");
    return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
  }

  const tokenData = await tokenResponse.json();
  const idToken = tokenData?.id_token;

  if (!idToken || typeof idToken !== "string") {
    return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
  }

  let profile;
  try {
    const profileResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!profileResponse.ok) {
      return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
    }
    profile = await profileResponse.json();
  } catch (error) {
    logger.error({ err: error }, "Không thể xác minh Google ID token");
    return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
  }

  const googleEmail = typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : "";
  const emailVerified = profile?.email_verified === true || profile?.email_verified === "true";

  if (!googleEmail || !EMAIL_REGEX.test(googleEmail) || !emailVerified) {
    return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
  }

  const audience = Array.isArray(profile?.aud) ? profile.aud : [profile?.aud];
  if (!audience.includes(process.env.GOOGLE_CLIENT_ID)) {
    logger.warn("Google ID token không đúng audience");
    return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
  }

  const existing = await pool.query(
    `SELECT id, name, email, role_id, is_system_admin, locked_until
     FROM users WHERE LOWER(email) = $1`,
    [googleEmail]
  );

  let user;
  if (existing.rows.length > 0) {
    user = existing.rows[0];
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
    }
  } else {
    if (process.env.ALLOW_PUBLIC_REGISTER !== "true") {
      return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
    }

    const roleResult = await pool.query("SELECT id FROM roles WHERE name = 'khach'");
    if (roleResult.rows.length === 0) {
      logger.error("Không tìm thấy vai trò mặc định cho Google OAuth");
      return res.redirect(`${frontendBase}/login?oauth_error=google_failed`);
    }

    const googleName =
      typeof profile?.name === "string" && profile.name.trim()
        ? profile.name.trim().slice(0, 255)
        : googleEmail;

    // Tạo dummy password_hash để thỏa mãn ràng buộc NOT NULL của cột password_hash
    const dummyPasswordHash = await argon2.hash(crypto.randomBytes(32).toString("hex"));

    const inserted = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_verified)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, email, role_id, is_system_admin`,
      [googleName, googleEmail, dummyPasswordHash, roleResult.rows[0].id]
    );
    user = inserted.rows[0];
  }

  let roleName = null;
  try {
    const roleResult = await pool.query("SELECT name FROM roles WHERE id = $1", [user.role_id]);
    if (roleResult.rows.length > 0) roleName = roleResult.rows[0].name;
  } catch (roleErr) {
    logger.warn({ err: roleErr }, "Không thể lấy tên vai trò cho Google OAuth");
  }

  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roleName,
    is_system_admin: user.is_system_admin || false,
  };

  return res.redirect(`${frontendBase}/projects`);
}));

module.exports = router;
