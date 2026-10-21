"use strict";

const express = require("express");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, requirePermission, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { evaluateGeofence } = require("../utils/geo");

// F-02 fix: dùng createProjectRouter() thay express.Router() để Default-Deny (T-07) hoạt động
const router = createProjectRouter();

/**
 * Hàm kiểm tra tính hợp lệ của số toạ độ và số chữ số thập phân
 */
function validateCoordinate(val, name, min, max) {
  if (val === undefined || val === null || val === "") {
    return `${name} không được để trống`;
  }
  if (typeof val === "boolean" || Array.isArray(val)) {
    return `${name} phải là số hợp lệ`;
  }
  const str = String(val).trim();
  if (str.includes(",")) {
    return `${name} không được chứa dấu phẩy, dùng dấu chấm thập phân`;
  }
  if (/[eE]/.test(str)) {
    return `${name} không được dùng định dạng khoa học (e/E)`;
  }
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return `${name} phải là số hợp lệ`;
  }
  if (num < min || num > max) {
    return `${name} phải nằm trong khoảng từ ${min} đến ${max}`;
  }

  if (str.includes(".")) {
    const decimals = str.split(".")[1];
    if (decimals && decimals.length > 6) {
      return `${name} không được vượt quá 6 chữ số thập phân`;
    }
  }
  return null;
}

/**
 * Hàm kiểm tra bán kính
 */
function validateRadius(val) {
  if (val === undefined || val === null || val === "") {
    return "Bán kính công trường không được để trống";
  }
  if (typeof val === "boolean" || Array.isArray(val)) {
    return "Bán kính phải là số nguyên (mét)";
  }
  const str = String(val).trim();
  if (str.includes(",") || str.includes(".") || /[eE]/.test(str)) {
    return "Bán kính phải là số nguyên (mét)";
  }
  const num = Number(val);
  if (!Number.isInteger(num)) {
    return "Bán kính phải là số nguyên (mét)";
  }
  if (num < 1 || num > 20000) {
    return "Bán kính công trường phải từ 1 đến 20.000 mét";
  }
  return null;
}

/**
 * Cập nhật lại geofence cho danh sách ảnh theo lô (batch 500)
 * TUYỆT ĐỐI KHÔNG SELECT file_data
 */
async function batchUpdatePhotoGeofence(client, tableName, photos, siteConfig) {
  if (!photos || photos.length === 0) return 0;
  const chunkSize = 500;
  let updatedCount = 0;

  for (let i = 0; i < photos.length; i += chunkSize) {
    const chunk = photos.slice(i, i + chunkSize);
    const valuesParams = [];
    const valuesPlaceholders = [];
    let pIdx = 1;

    for (const p of chunk) {
      const evalRes = evaluateGeofence({
        photo: {
          gps_latitude: p.gps_latitude,
          gps_longitude: p.gps_longitude,
          gps_accuracy_m: p.gps_accuracy_m,
          gps_source: p.gps_source,
        },
        site: siteConfig,
        basis: p.gps_source,
      });

      valuesPlaceholders.push(
        `($${pIdx}::int, $${pIdx + 1}::varchar, $${pIdx + 2}::numeric, $${pIdx + 3}::timestamptz, $${pIdx + 4}::varchar)`
      );
      valuesParams.push(p.id, evalRes.status, evalRes.distance_m, evalRes.checked_at, evalRes.basis);
      pIdx += 5;
    }

    try {
      const query = `
        UPDATE ${tableName} AS t
        SET geofence_status = v.geofence_status,
            geofence_distance_m = v.geofence_distance_m,
            geofence_checked_at = v.geofence_checked_at,
            geofence_basis = v.geofence_basis
        FROM (VALUES ${valuesPlaceholders.join(", ")}) AS v(id, geofence_status, geofence_distance_m, geofence_checked_at, geofence_basis)
        WHERE t.id = v.id
      `;
      await client.query(query, valuesParams);
    } catch (updateErr) {
      if (updateErr.code === "42703") {
        // Fallback khi DB chưa có cột geofence_basis
        const fbParams = [];
        const fbPlaceholders = [];
        let fIdx = 1;
        for (const p of chunk) {
          const evalRes = evaluateGeofence({
            photo: {
              gps_latitude: p.gps_latitude,
              gps_longitude: p.gps_longitude,
              gps_accuracy_m: p.gps_accuracy_m,
            },
            site: siteConfig,
          });
          fbPlaceholders.push(`($${fIdx}::int, $${fIdx + 1}::varchar, $${fIdx + 2}::numeric, $${fIdx + 3}::timestamptz)`);
          fbParams.push(p.id, evalRes.status, evalRes.distance_m, evalRes.checked_at);
          fIdx += 4;
        }
        const fbQuery = `
          UPDATE ${tableName} AS t
          SET geofence_status = v.geofence_status,
              geofence_distance_m = v.geofence_distance_m,
              geofence_checked_at = v.geofence_checked_at
          FROM (VALUES ${fbPlaceholders.join(", ")}) AS v(id, geofence_status, geofence_distance_m, geofence_checked_at)
          WHERE t.id = v.id
        `;
        await client.query(fbQuery, fbParams);
      } else {
        throw updateErr;
      }
    }
    updatedCount += chunk.length;
  }
  return updatedCount;
}

/**
 * GET /api/projects/:projectId/site-geofence
 * Lấy cấu hình tâm và bán kính công trường
 */
router.get(
  "/:projectId/site-geofence",
  requireAuth,
  checkProjectAccess,
  requirePermission("project.member"),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const result = await db.query(
      `SELECT p.site_latitude, p.site_longitude, p.site_radius_m,
              p.site_geofence_updated_at, p.site_geofence_updated_by,
              u.name AS updated_by_name
       FROM projects p
       LEFT JOIN users u ON u.id = p.site_geofence_updated_by
       WHERE p.id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy dự án" });
    }

    const row = result.rows[0];
    const configured =
      row.site_latitude !== null &&
      row.site_longitude !== null &&
      row.site_radius_m !== null;

    return res.status(200).json({
      configured,
      latitude: row.site_latitude !== null ? parseFloat(row.site_latitude) : null,
      longitude: row.site_longitude !== null ? parseFloat(row.site_longitude) : null,
      radius_m: row.site_radius_m !== null ? parseInt(row.site_radius_m, 10) : null,
      site_latitude: row.site_latitude !== null ? parseFloat(row.site_latitude) : null,
      site_longitude: row.site_longitude !== null ? parseFloat(row.site_longitude) : null,
      site_radius_m: row.site_radius_m !== null ? parseInt(row.site_radius_m, 10) : null,
      updated_at: row.site_geofence_updated_at,
      site_geofence_updated_at: row.site_geofence_updated_at,
      updated_by_name: row.updated_by_name || null,
      site_geofence_updated_by: row.site_geofence_updated_by,
    });
  })
);

/**
 * PUT /api/projects/:projectId/site-geofence
 * Cập nhật cấu hình tâm và bán kính công trường, tính lại toàn bộ ảnh trong 1 transaction
 */
router.put(
  "/:projectId/site-geofence",
  requireAuth,
  checkProjectAccess,
  requirePermission("site_geofence.manage"),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { latitude, longitude, radius_m } = req.body;

    const errors = [];
    const latErr = validateCoordinate(latitude, "Vĩ độ", -90, 90);
    if (latErr) errors.push(latErr);

    const lngErr = validateCoordinate(longitude, "Kinh độ", -180, 180);
    if (lngErr) errors.push(lngErr);

    const radErr = validateRadius(radius_m);
    if (radErr) errors.push(radErr);

    const numLat = Number(latitude);
    const numLng = Number(longitude);
    const numRad = Number(radius_m);

    // Chặn toạ độ (0, 0) - Null Island
    if (!latErr && !lngErr && numLat === 0 && numLng === 0) {
      errors.push("Toạ độ (0, 0) không hợp lệ (Null Island)");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: "Dữ liệu cấu hình phạm vi công trường không hợp lệ",
        errors,
      });
    }

    // Transaction
    const numericProjectId = parseInt(projectId, 10);
    const client = await (typeof db.connect === "function" ? db.connect() : db.getClient());
    try {
      await client.query("BEGIN");

      // Khóa dòng dự án
      const projRes = await client.query(
        `SELECT id, site_latitude, site_longitude, site_radius_m
         FROM projects
         WHERE id = $1
         FOR UPDATE`,
        [numericProjectId]
      );

      if (projRes.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(404).json({ message: "Không tìm thấy dự án" });
      }

      const beforeConfig = {
        site_latitude: projRes.rows[0].site_latitude !== null ? parseFloat(projRes.rows[0].site_latitude) : null,
        site_longitude: projRes.rows[0].site_longitude !== null ? parseFloat(projRes.rows[0].site_longitude) : null,
        site_radius_m: projRes.rows[0].site_radius_m !== null ? parseInt(projRes.rows[0].site_radius_m, 10) : null,
      };

      const updateRes = await client.query(
        `UPDATE projects
         SET site_latitude = $1,
             site_longitude = $2,
             site_radius_m = $3,
             site_geofence_updated_at = NOW(),
             site_geofence_updated_by = $4
         WHERE id = $5
         RETURNING site_latitude, site_longitude, site_radius_m, site_geofence_updated_at, site_geofence_updated_by`,
        [numLat, numLng, numRad, req.user?.id || null, numericProjectId]
      );

      const afterConfig = {
        site_latitude: parseFloat(updateRes.rows[0].site_latitude),
        site_longitude: parseFloat(updateRes.rows[0].site_longitude),
        site_radius_m: parseInt(updateRes.rows[0].site_radius_m, 10),
        site_geofence_updated_at: updateRes.rows[0].site_geofence_updated_at,
        site_geofence_updated_by: updateRes.rows[0].site_geofence_updated_by,
      };

      const siteConfig = {
        latitude: numLat,
        longitude: numLng,
        radius_m: numRad,
      };

      // 1. Tính lại cho acceptance_voucher_photos (chỉ lấy toạ độ, TUYỆT ĐỐI không file_data)
      let accPhotosRes;
      try {
        accPhotosRes = await client.query(
          `SELECT avp.id, avp.gps_latitude, avp.gps_longitude, avp.gps_accuracy_m, avp.gps_source
           FROM acceptance_voucher_photos avp
           JOIN acceptance_vouchers av ON avp.voucher_id = av.id
           WHERE av.project_id = $1`,
          [numericProjectId]
        );
      } catch (selErr) {
        if (selErr.code === "42703") {
          accPhotosRes = await client.query(
            `SELECT avp.id, avp.gps_latitude, avp.gps_longitude, avp.gps_accuracy_m
             FROM acceptance_voucher_photos avp
             JOIN acceptance_vouchers av ON avp.voucher_id = av.id
             WHERE av.project_id = $1`,
            [numericProjectId]
          );
        } else {
          throw selErr;
        }
      }
      const accUpdated = await batchUpdatePhotoGeofence(
        client,
        "acceptance_voucher_photos",
        accPhotosRes.rows,
        siteConfig
      );

      // 2. Tính lại cho diary_entry_attachments
      let diaryPhotosRes;
      try {
        diaryPhotosRes = await client.query(
          `SELECT dea.id, dea.gps_latitude, dea.gps_longitude, dea.gps_accuracy_m, dea.gps_source
           FROM diary_entry_attachments dea
           JOIN diary_entries de ON dea.diary_entry_id = de.id
           WHERE de.project_id = $1`,
          [numericProjectId]
        );
      } catch (selErr) {
        if (selErr.code === "42703") {
          diaryPhotosRes = await client.query(
            `SELECT dea.id, dea.gps_latitude, dea.gps_longitude, dea.gps_accuracy_m
             FROM diary_entry_attachments dea
             JOIN diary_entries de ON dea.diary_entry_id = de.id
             WHERE de.project_id = $1`,
            [numericProjectId]
          );
        } else {
          throw selErr;
        }
      }
      const diaryUpdated = await batchUpdatePhotoGeofence(
        client,
        "diary_entry_attachments",
        diaryPhotosRes.rows,
        siteConfig
      );

      // 3. Ghi audit_logs append-only trong cùng giao dịch
      const userId = req.user ? req.user.id : null;
      const ipAddress = req.ip || req.connection?.remoteAddress || null;
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, project_id, details, ip_address)
         VALUES ($1, $2, $3, $4::int, $5::int, $6, $7)`,
        [
          userId,
          "SITE_GEOFENCE_SET",
          "projects",
          numericProjectId,
          numericProjectId,
          JSON.stringify({
            before: beforeConfig,
            after: {
              site_latitude: afterConfig.site_latitude,
              site_longitude: afterConfig.site_longitude,
              site_radius_m: afterConfig.site_radius_m,
            },
          }),
          ipAddress,
        ]
      );

      await client.query("COMMIT");
      client.release();

      return res.status(200).json({
        message: "Cấu hình phạm vi công trường thành công",
        data: afterConfig,
        recalculated: {
          acceptance_photos: accUpdated,
          diary_photos: diaryUpdated,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      client.release();
      throw err;
    }
  })
);

/**
 * DELETE /api/projects/:projectId/site-geofence
 * Xóa cấu hình phạm vi công trường, cập nhật lại trạng thái ảnh (ảnh có GPS -> no_site_config, ảnh không GPS -> no_gps)
 */
router.delete(
  "/:projectId/site-geofence",
  requireAuth,
  checkProjectAccess,
  requirePermission("site_geofence.manage"),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    const numericProjectId = parseInt(projectId, 10);
    const client = await (typeof db.connect === "function" ? db.connect() : db.getClient());
    try {
      await client.query("BEGIN");

      const projRes = await client.query(
        `SELECT id, site_latitude, site_longitude, site_radius_m
         FROM projects
         WHERE id = $1
         FOR UPDATE`,
        [numericProjectId]
      );

      if (projRes.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(404).json({ message: "Không tìm thấy dự án" });
      }

      const beforeConfig = {
        site_latitude: projRes.rows[0].site_latitude !== null ? parseFloat(projRes.rows[0].site_latitude) : null,
        site_longitude: projRes.rows[0].site_longitude !== null ? parseFloat(projRes.rows[0].site_longitude) : null,
        site_radius_m: projRes.rows[0].site_radius_m !== null ? parseInt(projRes.rows[0].site_radius_m, 10) : null,
      };

      await client.query(
        `UPDATE projects
         SET site_latitude = NULL,
             site_longitude = NULL,
             site_radius_m = NULL,
             site_geofence_updated_at = NOW(),
             site_geofence_updated_by = $1
         WHERE id = $2`,
        [req.user?.id || null, numericProjectId]
      );

      // Cập nhật lại ảnh với siteConfig = null
      let accPhotosRes;
      try {
        accPhotosRes = await client.query(
          `SELECT avp.id, avp.gps_latitude, avp.gps_longitude, avp.gps_accuracy_m, avp.gps_source
           FROM acceptance_voucher_photos avp
           JOIN acceptance_vouchers av ON avp.voucher_id = av.id
           WHERE av.project_id = $1`,
          [numericProjectId]
        );
      } catch (selErr) {
        if (selErr.code === "42703") {
          accPhotosRes = await client.query(
            `SELECT avp.id, avp.gps_latitude, avp.gps_longitude, avp.gps_accuracy_m
             FROM acceptance_voucher_photos avp
             JOIN acceptance_vouchers av ON avp.voucher_id = av.id
             WHERE av.project_id = $1`,
            [numericProjectId]
          );
        } else {
          throw selErr;
        }
      }
      const accUpdated = await batchUpdatePhotoGeofence(
        client,
        "acceptance_voucher_photos",
        accPhotosRes.rows,
        null
      );

      let diaryPhotosRes;
      try {
        diaryPhotosRes = await client.query(
          `SELECT dea.id, dea.gps_latitude, dea.gps_longitude, dea.gps_accuracy_m, dea.gps_source
           FROM diary_entry_attachments dea
           JOIN diary_entries de ON dea.diary_entry_id = de.id
           WHERE de.project_id = $1`,
          [numericProjectId]
        );
      } catch (selErr) {
        if (selErr.code === "42703") {
          diaryPhotosRes = await client.query(
            `SELECT dea.id, dea.gps_latitude, dea.gps_longitude, dea.gps_accuracy_m
             FROM diary_entry_attachments dea
             JOIN diary_entries de ON dea.diary_entry_id = de.id
             WHERE de.project_id = $1`,
            [numericProjectId]
          );
        } else {
          throw selErr;
        }
      }
      const diaryUpdated = await batchUpdatePhotoGeofence(
        client,
        "diary_entry_attachments",
        diaryPhotosRes.rows,
        null
      );

      // Ghi audit_logs append-only trong cùng giao dịch
      const userId = req.user ? req.user.id : null;
      const ipAddress = req.ip || req.connection?.remoteAddress || null;
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, project_id, details, ip_address)
         VALUES ($1, $2, $3, $4::int, $5::int, $6, $7)`,
        [
          userId,
          "SITE_GEOFENCE_CLEAR",
          "projects",
          numericProjectId,
          numericProjectId,
          JSON.stringify({
            before: beforeConfig,
          }),
          ipAddress,
        ]
      );

      await client.query("COMMIT");
      client.release();

      return res.status(200).json({
        message: "Đã xóa cấu hình phạm vi công trường thành công",
        recalculated: {
          acceptance_photos: accUpdated,
          diary_photos: diaryUpdated,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      client.release();
      throw err;
    }
  })
);

module.exports = router;
