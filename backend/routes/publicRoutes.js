const express = require('express');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');

// Xóa dấu tiếng Việt
function removeAccents(str) {
  return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// GET /api/public/projects - Danh sách dự án công khai
router.get('/projects', async (req, res, next) => {
  try {
    const { q, tinh, loai, limit = 10, offset = 0 } = req.query;

    let query = `
      SELECT id, name, code, province, project_type, stage, description, cover_image_url, expected_completion_date, status, updated_at
      FROM projects
      WHERE is_public = true
    `;
    const params = [];
    let paramIndex = 1;

    if (q) {
      query += ` AND normalized_search_text ILIKE $${paramIndex}`;
      params.push(`%${removeAccents(q).toLowerCase()}%`);
      paramIndex++;
    }

    if (tinh && tinh !== 'Tất cả địa điểm') {
      query += ` AND province = $${paramIndex}`;
      params.push(tinh);
      paramIndex++;
    }

    if (loai && loai !== 'Tất cả loại dự án') {
      query += ` AND project_type = $${paramIndex}`;
      params.push(loai);
      paramIndex++;
    }

    // Luôn sắp xếp dự án mới cập nhật lên đầu
    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Tính tổng số kết quả
    let countQuery = `
      SELECT COUNT(*)
      FROM projects
      WHERE is_public = true
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (q) {
      countQuery += ` AND normalized_search_text ILIKE $${countParamIndex}`;
      countParams.push(`%${removeAccents(q).toLowerCase()}%`);
      countParamIndex++;
    }

    if (tinh && tinh !== 'Tất cả địa điểm') {
      countQuery += ` AND province = $${countParamIndex}`;
      countParams.push(tinh);
      countParamIndex++;
    }

    if (loai && loai !== 'Tất cả loại dự án') {
      countQuery += ` AND project_type = $${countParamIndex}`;
      countParams.push(loai);
    }

    const countResult = await db.query(countQuery, countParams);

    return res.json({
      projects: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/public/projects/:id - Chi tiết dự án công khai
router.get('/projects/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, code, location, province, project_type, stage, description, cover_image_url, start_date, expected_completion_date, status, updated_at
       FROM projects
       WHERE id = $1 AND is_public = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy dự án hoặc dự án không được công khai" });
    }

    return res.json({ project: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Cấu hình rate limit động từ app.js
let newsletterLimiter = (req, res, next) => next();
let invitationLimiter = (req, res, next) => next();

function setNewsletterLimiter(limiter) {
  newsletterLimiter = limiter;
}

function setInvitationLimiter(limiter) {
  invitationLimiter = limiter;
}

// POST /api/public/newsletter - Đăng ký nhận tin
router.post('/newsletter', (req, res, next) => newsletterLimiter(req, res, next), async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }

    try {
      await db.query(
        "INSERT INTO newsletters (email) VALUES ($1)",
        [email.toLowerCase()]
      );
    } catch (err) {
      // Bỏ qua lỗi duplicate email (23505) để tránh email enumeration
      if (err.code !== '23505') {
        throw err;
      }
    }

    return res.json({ message: "Đăng ký nhận tin thành công!" });
  } catch (error) {
    next(error);
  }
});

// GET /api/public/invitations/:token - Kiểm tra token mời
router.get('/invitations/:token', (req, res, next) => invitationLimiter(req, res, next), async (req, res, next) => {
  try {
    const { token } = req.params;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const invRes = await db.query(
      'SELECT id, email, project_id, project_role FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
      [tokenHash]
    );

    if (invRes.rows.length === 0) {
      return res.status(400).json({ message: 'Mã thư mời không hợp lệ hoặc đã hết hạn' });
    }

    const invitation = invRes.rows[0];
    
    // Kiểm tra xem user có tồn tại không
    const userRes = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [invitation.email]);
    const userExists = userRes.rows.length > 0;

    return res.json({
      email: invitation.email,
      projectId: invitation.project_id,
      projectRole: invitation.project_role,
      userExists
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/public/invitations/:token/accept - Chấp nhận lời mời (cho user đã có tài khoản)
router.post('/invitations/:token/accept', (req, res, next) => invitationLimiter(req, res, next), async (req, res, next) => {
  try {
    const { token } = req.params;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      const invRes = await client.query(
        'SELECT id, email, project_id, project_role FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP FOR UPDATE',
        [tokenHash]
      );

      if (invRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Mã thư mời không hợp lệ hoặc đã hết hạn' });
      }

      const invitation = invRes.rows[0];
      
      // Kiểm tra user
      const userRes = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [invitation.email]);
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Người dùng chưa có tài khoản, vui lòng đăng ký' });
      }

      const userId = userRes.rows[0].id;

      // Cập nhật thư mời
      await client.query('UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [invitation.id]);

      // Thêm vào project nếu có
      if (invitation.project_id && invitation.project_role) {
        // Check if already in project
        const memberCheck = await client.query(
          'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
          [invitation.project_id, userId]
        );
        if (memberCheck.rows.length === 0) {
          await client.query(
            'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
            [invitation.project_id, userId, invitation.project_role]
          );
        }
      }

      await client.query('COMMIT');
      return res.json({ message: 'Chấp nhận lời mời thành công' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

module.exports = { router, removeAccents, setNewsletterLimiter, setInvitationLimiter };
