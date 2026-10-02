const express = require('express');
const router = express.Router();
const db = require('../config/db');

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

// POST /api/public/newsletter - Đăng ký nhận tin
router.post('/newsletter', async (req, res, next) => {
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

module.exports = { router, removeAccents };
