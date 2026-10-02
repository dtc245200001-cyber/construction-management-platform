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

module.exports = { router, removeAccents };
