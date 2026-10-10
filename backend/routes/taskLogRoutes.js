"use strict";

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  allow,
} = require("../middleware/projectAccess");
const { ROLES } = require("../utils/constants");

const router = express.Router({ mergeParams: true });

const { isCloudinaryConfigured, uploadToCloudinary } = require("../lib/cloudinary");

// Helper to resolve attachment URL
function formatAttachmentUrl(projectId, taskId, logId, attachment) {
  if (
    attachment.file_path &&
    (attachment.file_path.startsWith("http://") || attachment.file_path.startsWith("https://"))
  ) {
    return attachment.file_path;
  }
  return `/api/projects/${projectId}/tasks/${taskId}/logs/${logId}/attachments/${attachment.id}`;
}

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.error("Không thể tạo thư mục uploads:", err.message);
}

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// GET /api/projects/:projectId/tasks/:taskId/logs
router.get(
  "/:projectId/tasks/:taskId/logs",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.params.taskId);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "taskId không hợp lệ" });
    }

    try {
      // Verify task belongs to project
      const taskResult = await db.query(
        `SELECT t.id, t.name 
         FROM tasks t 
         JOIN work_items wi ON wi.id = t.work_item_id 
         WHERE t.id = $1 AND wi.project_id = $2`,
        [taskId, projectId]
      );

      if (taskResult.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy task trong project" });
      }

      const logsResult = await db.query(
        `SELECT tl.id, tl.task_id, tl.user_id, tl.content, tl.created_at, tl.updated_at,
                u.name AS user_name, u.email AS user_email
         FROM task_logs tl
         JOIN users u ON u.id = tl.user_id
         WHERE tl.task_id = $1
         ORDER BY tl.created_at DESC, tl.id DESC`,
        [taskId]
      );

      const logIds = logsResult.rows.map(r => r.id);
      const attachmentsByLogId = {};

      if (logIds.length > 0) {
        const attachResult = await db.query(
          `SELECT id, task_log_id, file_path, file_name, file_size, mime_type, created_at
           FROM task_attachments
           WHERE task_log_id = ANY($1::int[])
           ORDER BY id ASC`,
          [logIds]
        );

        for (const a of attachResult.rows) {
          if (!attachmentsByLogId[a.task_log_id]) {
            attachmentsByLogId[a.task_log_id] = [];
          }
          attachmentsByLogId[a.task_log_id].push({
            id: a.id,
            task_log_id: a.task_log_id,
            file_name: a.file_name,
            file_size: a.file_size,
            mime_type: a.mime_type,
            created_at: a.created_at,
            url: formatAttachmentUrl(projectId, taskId, a.task_log_id, a)
          });
        }
      }

      const formattedLogs = logsResult.rows.map(log => ({
        id: log.id,
        task_id: log.task_id,
        user_id: log.user_id,
        user_name: log.user_name,
        user_email: log.user_email,
        content: log.content,
        created_at: log.created_at,
        updated_at: log.updated_at,
        attachments: attachmentsByLogId[log.id] || []
      }));

      return res.json({
        data: formattedLogs
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/tasks/:taskId/logs
router.post(
  "/:projectId/tasks/:taskId/logs",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  (req, res, next) => {
    upload.array("images", 10)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: "Multer error: " + err.message });
      } else if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.params.taskId);
    const userId = req.user.id;
    const content = req.body.content || null;

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "taskId không hợp lệ" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Verify task belongs to project
      const taskResult = await client.query(
        `SELECT t.id 
         FROM tasks t 
         JOIN work_items wi ON wi.id = t.work_item_id 
         WHERE t.id = $1 AND wi.project_id = $2`,
        [taskId, projectId]
      );

      if (taskResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy task trong project" });
      }

      // Insert log
      const logInsert = await client.query(
        `INSERT INTO task_logs (task_id, user_id, content) 
         VALUES ($1, $2, $3) RETURNING id, created_at`,
        [taskId, userId, content]
      );
      const logId = logInsert.rows[0].id;

      const attachments = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          let fileBuffer = null;
          try {
            if (file.path && fs.existsSync(file.path)) {
              fileBuffer = fs.readFileSync(file.path);
            } else if (file.buffer) {
              fileBuffer = file.buffer;
            }
          } catch (readErr) {
            console.warn("Không thể đọc buffer từ file:", readErr.message);
          }

          let storedFilePath = file.filename;
          let storedFileData = fileBuffer;

          // Nếu Cloudinary được cấu hình, upload lên Cloudinary
          if (isCloudinaryConfigured() && fileBuffer) {
            try {
              const cloudResult = await uploadToCloudinary(fileBuffer, {
                folder: `construction_management/projects/${projectId}/tasks/${taskId}`,
                public_id: `log_${logId}_${Date.now()}_${Math.round(Math.random() * 1e9)}`,
              });
              storedFilePath = cloudResult.url;
              // Không lưu dữ liệu BYTEA nếu đã upload thành công lên Cloudinary
              storedFileData = null;
            } catch (cloudErr) {
              console.error("Lỗi khi upload lên Cloudinary, chuyển sang lưu trữ fallback:", cloudErr.message);
            }
          }

          const attachInsert = await client.query(
            `INSERT INTO task_attachments (task_log_id, file_path, file_name, file_size, mime_type, file_data) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, file_path, file_name, file_size, mime_type, created_at`,
            [logId, storedFilePath, file.originalname, file.size, file.mimetype, storedFileData]
          );
          attachments.push(attachInsert.rows[0]);
        }
      }

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Tạo nhật ký thành công",
        log: {
          id: logId,
          task_id: taskId,
          user_id: userId,
          user_name: req.user.name || req.user.email,
          content: content,
          created_at: logInsert.rows[0].created_at,
          attachments: attachments.map(a => ({
            id: a.id,
            task_log_id: logId,
            file_name: a.file_name,
            file_size: a.file_size,
            mime_type: a.mime_type,
            created_at: a.created_at,
            url: formatAttachmentUrl(projectId, taskId, logId, a)
          }))
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// GET /api/projects/:projectId/tasks/:taskId/logs/:logId/attachments/:attachmentId
router.get(
  "/:projectId/tasks/:taskId/logs/:logId/attachments/:attachmentId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.params.taskId);
    const logId = Number(req.params.logId);
    const attachmentId = Number(req.params.attachmentId);

    if (!Number.isInteger(taskId) || !Number.isInteger(logId) || !Number.isInteger(attachmentId)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    try {
      // Verify all relations
      const result = await db.query(
        `SELECT ta.file_path, ta.mime_type, ta.file_name, ta.file_data
         FROM task_attachments ta
         JOIN task_logs tl ON tl.id = ta.task_log_id
         JOIN tasks t ON t.id = tl.task_id
         JOIN work_items wi ON wi.id = t.work_item_id
         WHERE ta.id = $1 AND tl.id = $2 AND t.id = $3 AND wi.project_id = $4`,
        [attachmentId, logId, taskId, projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy file hoặc bạn không có quyền truy cập" });
      }

      const fileInfo = result.rows[0];

      // 1. Nếu lưu trên Cloudinary (URL HTTP/HTTPS) -> Chuyển hướng đến Cloudinary CDN an toàn
      if (
        fileInfo.file_path &&
        (fileInfo.file_path.startsWith("http://") || fileInfo.file_path.startsWith("https://"))
      ) {
        return res.redirect(fileInfo.file_path);
      }

      // 2. Phục vụ trực tiếp từ PostgreSQL BYTEA nếu có (bền vững tuyệt đối trên Render / container)
      if (fileInfo.file_data) {
        res.setHeader("Content-Type", fileInfo.mime_type || "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        return res.send(fileInfo.file_data);
      }

      // 3. Dự phòng: Đọc từ ổ đĩa (cho file cũ hoặc khi gắn Persistent Disk)
      if (fileInfo.file_path) {
        const absolutePath = path.isAbsolute(fileInfo.file_path)
          ? fileInfo.file_path
          : path.join(uploadDir, fileInfo.file_path);

        if (fs.existsSync(absolutePath)) {
          res.setHeader("Content-Type", fileInfo.mime_type || "application/octet-stream");
          res.setHeader("Cache-Control", "public, max-age=86400, immutable");
          const fileStream = fs.createReadStream(absolutePath);
          return fileStream.pipe(res);
        }
      }

      // 4. Không tìm thấy cả trong Cloudinary, DB lẫn trên đĩa
      return res.status(404).json({ message: "File không tồn tại trên hệ thống lưu trữ hoặc đã bị xoá" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
