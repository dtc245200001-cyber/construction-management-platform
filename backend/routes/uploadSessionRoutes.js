"use strict";

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, allow, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");
const { isCloudinaryConfigured, uploadToCloudinary } = require("../lib/cloudinary");

const router = createProjectRouter();

// Upload dir config
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const tempUploadDir = path.join(uploadDir, "temp_sessions");

if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    console.error("Không thể tạo thư mục uploads:", err.message);
  }
}

if (!fs.existsSync(tempUploadDir)) {
  try {
    fs.mkdirSync(tempUploadDir, { recursive: true });
  } catch (err) {
    console.error("Không thể tạo thư mục uploads/temp_sessions:", err.message);
  }
}

// Multer memory storage for chunk upload via multipart
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per chunk
});

// Raw body parser middleware for octet-stream chunks
const rawChunkParser = express.raw({
  type: ["application/octet-stream", "application/x-binary"],
  limit: "10mb",
});

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DEFAULT_CHUNK_SIZE = 512 * 1024; // 512KB

function formatAttachmentUrl(projectId, taskId, logId, attachment) {
  if (
    attachment.file_path &&
    (attachment.file_path.startsWith("http://") || attachment.file_path.startsWith("https://"))
  ) {
    return attachment.file_path;
  }
  return `/api/projects/${projectId}/tasks/${taskId}/logs/${logId}/attachments/${attachment.id}`;
}

/**
 * POST /api/projects/:projectId/upload-sessions
 * Khởi tạo upload session cho tải ảnh từng phần
 */
router.post(
  "/:projectId/upload-sessions",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const {
      file_name,
      file_size,
      mime_type,
      checksum,
      task_log_id,
      diary_entry_id,
      chunk_size = DEFAULT_CHUNK_SIZE,
    } = req.body;

    // 1. Kiểm tra đầu vào bắt buộc
    if (!file_name || typeof file_name !== "string" || file_name.trim().length === 0) {
      return res.status(400).json({ message: "file_name không được để trống" });
    }

    const fileSizeNum = Number(file_size);
    if (!Number.isInteger(fileSizeNum) || fileSizeNum <= 0) {
      return res.status(400).json({ message: "file_size phải là số nguyên dương" });
    }

    if (fileSizeNum > MAX_FILE_SIZE) {
      return res.status(400).json({
        message: `Kích thước file vượt quá giới hạn tối đa cho phép (50 MB). File: ${fileSizeNum} bytes`,
      });
    }

    if (!mime_type || !ALLOWED_MIME_TYPES.includes(mime_type.toLowerCase())) {
      return res.status(400).json({
        message: `Loại file không hợp lệ. Chỉ chấp nhận các định dạng ảnh: ${ALLOWED_MIME_TYPES.join(", ")}`,
      });
    }

    if (!checksum || !/^[a-f0-9]{64}$/i.test(checksum)) {
      return res.status(400).json({
        message: "checksum bắt buộc và phải là chuỗi SHA-256 (64 ký tự hex)",
      });
    }

    if (!task_log_id && !diary_entry_id) {
      return res.status(400).json({
        message: "Phải cung cấp task_log_id hoặc diary_entry_id để gắn ảnh",
      });
    }

    const client = await db.connect();
    try {
      let resolvedTaskId = null;

      // 2. Kiểm tra quyền gắn vào task_log hoặc diary_entry
      if (task_log_id) {
        const parsedLogId = parsePositiveInt(task_log_id);
        if (!parsedLogId) return res.status(400).json({ message: "task_log_id không hợp lệ" });

        const logCheck = await client.query(
          `SELECT tl.id, tl.task_id, wi.project_id 
           FROM task_logs tl
           JOIN tasks t ON t.id = tl.task_id
           JOIN work_items wi ON wi.id = t.work_item_id
           WHERE tl.id = $1 AND wi.project_id = $2`,
          [parsedLogId, projectId]
        );

        if (logCheck.rows.length === 0) {
          return res.status(404).json({
            message: "Nhật ký công việc không tồn tại hoặc không thuộc dự án này",
          });
        }
        resolvedTaskId = logCheck.rows[0].task_id;
      } else if (diary_entry_id) {
        const parsedDiaryId = parsePositiveInt(diary_entry_id);
        if (!parsedDiaryId) return res.status(400).json({ message: "diary_entry_id không hợp lệ" });

        const diaryCheck = await client.query(
          `SELECT id FROM diary_entries WHERE id = $1 AND project_id = $2`,
          [parsedDiaryId, projectId]
        );

        if (diaryCheck.rows.length === 0) {
          return res.status(404).json({
            message: "Mục nhật ký thi công không tồn tại hoặc không thuộc dự án này",
          });
        }
      }

      // 3. Khởi tạo session UUID và file tạm
      const sessionId = crypto.randomUUID();
      const tempFilePath = path.join(tempUploadDir, `${sessionId}.part`);

      // Tạo tệp tạm rỗng
      fs.writeFileSync(tempFilePath, Buffer.alloc(0));

      const effectiveChunkSize = Math.max(64 * 1024, Math.min(5 * 1024 * 1024, Number(chunk_size) || DEFAULT_CHUNK_SIZE));
      const totalChunks = Math.ceil(fileSizeNum / effectiveChunkSize);

      const insertRes = await client.query(
        `INSERT INTO upload_sessions (
          session_id, project_id, task_log_id, diary_entry_id, user_id,
          file_name, file_size, mime_type, checksum,
          bytes_uploaded, total_chunks, chunk_size, chunks_received,
          status, temp_file_path
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          0, $10, $11, 0,
          'active', $12
        ) RETURNING *`,
        [
          sessionId,
          projectId,
          task_log_id || null,
          diary_entry_id || null,
          req.user.id,
          path.basename(file_name.trim()),
          fileSizeNum,
          mime_type.toLowerCase(),
          checksum.toLowerCase(),
          totalChunks,
          effectiveChunkSize,
          tempFilePath,
        ]
      );

      const session = insertRes.rows[0];

      return res.status(201).json({
        session_id: session.session_id,
        project_id: projectId,
        task_log_id: session.task_log_id,
        diary_entry_id: session.diary_entry_id,
        task_id: resolvedTaskId,
        file_name: session.file_name,
        file_size: Number(session.file_size),
        bytes_uploaded: 0,
        offset: 0,
        chunk_size: session.chunk_size,
        total_chunks: session.total_chunks,
        status: session.status,
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/projects/:projectId/upload-sessions/:sessionId
 * Lấy trạng thái session và offset hiện tại để resume khi mất mạng
 */
router.get(
  "/:projectId/upload-sessions/:sessionId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const { sessionId } = req.params;

    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!sessionId || !/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
      return res.status(400).json({ message: "sessionId không hợp lệ" });
    }

    const result = await db.query(
      `SELECT * FROM upload_sessions WHERE session_id = $1 AND project_id = $2`,
      [sessionId, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy upload session" });
    }

    const session = result.rows[0];

    if (session.status === "active" && session.expires_at && new Date(session.expires_at) < new Date()) {
      await db.query(`UPDATE upload_sessions SET status = 'expired', updated_at = NOW() WHERE id = $1`, [session.id]);
      session.status = "expired";
    }

    const isCompleted = session.status === "completed";

    let attachment = null;
    if (isCompleted) {
      if (session.attachment_id) {
        const attachRes = await db.query(
          `SELECT ta.*, tl.task_id 
           FROM task_attachments ta
           JOIN task_logs tl ON tl.id = ta.task_log_id
           WHERE ta.id = $1`,
          [session.attachment_id]
        );
        if (attachRes.rows.length > 0) {
          const a = attachRes.rows[0];
          attachment = {
            id: a.id,
            task_log_id: a.task_log_id,
            file_name: a.file_name,
            file_size: a.file_size,
            mime_type: a.mime_type,
            url: formatAttachmentUrl(projectId, a.task_id, a.task_log_id, a),
          };
        }
      } else if (session.task_log_id) {
        const attachRes = await db.query(
          `SELECT ta.*, tl.task_id 
           FROM task_attachments ta
           JOIN task_logs tl ON tl.id = ta.task_log_id
           WHERE ta.task_log_id = $1 AND ta.file_name = $2
           ORDER BY ta.id DESC LIMIT 1`,
          [session.task_log_id, session.file_name]
        );
        if (attachRes.rows.length > 0) {
          const a = attachRes.rows[0];
          attachment = {
            id: a.id,
            task_log_id: a.task_log_id,
            file_name: a.file_name,
            file_size: a.file_size,
            mime_type: a.mime_type,
            url: formatAttachmentUrl(projectId, a.task_id, a.task_log_id, a),
          };
        }
      }
    }

    return res.json({
      session_id: session.session_id,
      file_name: session.file_name,
      file_size: Number(session.file_size),
      bytes_uploaded: Number(session.bytes_uploaded),
      offset: Number(session.bytes_uploaded),
      chunk_size: session.chunk_size,
      chunks_received: session.chunks_received,
      total_chunks: session.total_chunks,
      status: session.status,
      is_completed: isCompleted,
      attachment,
    });
  })
);

/**
 * PATCH /api/projects/:projectId/upload-sessions/:sessionId/chunk
 * (hoặc POST /api/projects/:projectId/upload-sessions/:sessionId/chunk)
 * Tải lên một phần (chunk) của ảnh
 */
const handleChunkUpload = async (req, res, next) => {
  const projectId = parsePositiveInt(req.params.projectId);
  const { sessionId } = req.params;

  if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
  if (!sessionId || !/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
    return res.status(400).json({ message: "sessionId không hợp lệ" });
  }

  // 1. Đọc dữ liệu chunk từ req
  let chunkBuffer = null;
  if (req.file && req.file.buffer) {
    chunkBuffer = req.file.buffer;
  } else if (Buffer.isBuffer(req.body)) {
    chunkBuffer = req.body;
  }

  if (!chunkBuffer || chunkBuffer.length === 0) {
    return res.status(400).json({ message: "Dữ liệu chunk rỗng hoặc không đúng định dạng" });
  }

  // 2. Đọc offset từ header hoặc query
  const rawOffset =
    req.headers["upload-offset"] ||
    req.headers["x-upload-offset"] ||
    req.query.offset ||
    req.body?.offset;

  if (rawOffset === undefined || rawOffset === null) {
    return res.status(400).json({
      message: "Thiếu header Upload-Offset để xác định vị trí tải",
    });
  }

  const offset = Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0) {
    return res.status(400).json({ message: "Upload-Offset không hợp lệ" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Lấy session với khóa FOR UPDATE để chống đua (concurrency safety)
    const sessionRes = await client.query(
      `SELECT * FROM upload_sessions WHERE session_id = $1 AND project_id = $2 FOR UPDATE`,
      [sessionId, projectId]
    );

    if (sessionRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Upload session không tồn tại" });
    }

    const session = sessionRes.rows[0];

    // Kiểm tra trạng thái session
    if (session.status === "completed") {
      await client.query("ROLLBACK");
      return res.status(200).json({
        session_id: sessionId,
        status: "completed",
        bytes_uploaded: Number(session.file_size),
        message: "Session đã hoàn thành trước đó",
      });
    }

    // Kiểm tra hết hạn của session (24h)
    if (session.status === "active" && session.expires_at && new Date(session.expires_at) < new Date()) {
      await client.query(`UPDATE upload_sessions SET status = 'expired', updated_at = NOW() WHERE id = $1`, [session.id]);
      session.status = "expired";
    }

    if (session.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Upload session không hoạt động (trạng thái: ${session.status})`,
      });
    }

    const expectedOffset = Number(session.bytes_uploaded);

    // 3. Kiểm tra tính liên tục của offset (chống mất gói / lặp gói)
    if (offset !== expectedOffset) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "OFFSET_MISMATCH",
        message: `Offset tải lên (${offset}) không khớp với tiến độ server (${expectedOffset})`,
        expected_offset: expectedOffset,
        bytes_uploaded: expectedOffset,
      });
    }

    const tempFilePath = session.temp_file_path;
    if (!tempFilePath) {
      await client.query("ROLLBACK");
      return res.status(500).json({ message: "Thiếu đường dẫn tệp tạm trên server" });
    }

    // Đảm bảo tệp tạm tồn tại và khớp chính xác với expectedOffset (chống rác do rollback / gián đoạn)
    if (!fs.existsSync(tempFilePath)) {
      if (expectedOffset === 0) {
        fs.writeFileSync(tempFilePath, Buffer.alloc(0));
      } else {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "TEMP_FILE_MISSING",
          message: "Tệp tạm trên máy chủ không còn tồn tại, vui lòng khởi tạo lại lượt tải",
          expected_offset: 0,
        });
      }
    }

    try {
      const stat = fs.statSync(tempFilePath);
      if (stat.size !== expectedOffset) {
        fs.truncateSync(tempFilePath, expectedOffset);
      }
    } catch (truncErr) {
      // ignore
    }

    // 4. Ghi chunk vào tệp tạm
    fs.appendFileSync(tempFilePath, chunkBuffer);

    const newBytesUploaded = expectedOffset + chunkBuffer.length;
    const totalFileSize = Number(session.file_size);

    if (newBytesUploaded > totalFileSize) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Tổng kích thước chunk nhận được (${newBytesUploaded}) vượt quá file_size (${totalFileSize})`,
      });
    }

    // 5. Kiểm tra nếu đã nhận đủ toàn bộ file
    if (newBytesUploaded === totalFileSize) {
      // Đọc toàn bộ file để kiểm tra mã băm SHA-256
      const completeFileBuffer = fs.readFileSync(tempFilePath);
      const computedChecksum = crypto
        .createHash("sha256")
        .update(completeFileBuffer)
        .digest("hex")
        .toLowerCase();

      if (computedChecksum !== session.checksum.toLowerCase()) {
        // Mã băm sai -> Xóa file tạm và đánh dấu session thất bại
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch (e) {
          // ignore
        }

        await client.query(
          `UPDATE upload_sessions SET status = 'aborted', updated_at = NOW() WHERE id = $1`,
          [session.id]
        );
        await client.query("COMMIT");

        return res.status(422).json({
          code: "CHECKSUM_MISMATCH",
          message: "Mã băm SHA-256 không khớp, tệp có thể đã bị lỗi khi truyền qua mạng",
          expected: session.checksum,
          actual: computedChecksum,
        });
      }

      // Mã băm khớp -> Lưu trữ file hoàn chỉnh
      let storedFilePath = session.file_name;
      let storedFileData = completeFileBuffer;

      // 5.1. Upload lên Cloudinary nếu có cấu hình
      if (isCloudinaryConfigured()) {
        try {
          const cloudResult = await uploadToCloudinary(completeFileBuffer, {
            folder: `construction_management/projects/${projectId}/sessions`,
            public_id: `upload_${session.id}_${Date.now()}`,
          });
          storedFilePath = cloudResult.url;
          storedFileData = null; // Không cần BYTEA nếu đã lên Cloudinary
        } catch (cloudErr) {
          console.error("Lỗi khi upload Cloudinary trong chunk session, dùng fallback:", cloudErr.message);
        }
      }

      // 5.2. Nếu lưu file nội bộ, lưu vào thư mục uploads
      if (!storedFilePath.startsWith("http")) {
        const uniqueFileName = `${Date.now()}_${Math.round(Math.random() * 1e9)}_${session.file_name}`;
        const finalDiskPath = path.join(uploadDir, uniqueFileName);
        try {
          fs.writeFileSync(finalDiskPath, completeFileBuffer);
          storedFilePath = uniqueFileName;
        } catch (writeErr) {
          console.warn("Không thể ghi tệp lên đĩa, dùng lưu trữ BYTEA trong database:", writeErr.message);
        }
      }

      // 5.3. Tạo bản ghi đính kèm vào task_attachments
      let attachRow = null;
      let resolvedTaskId = null;

      if (session.task_log_id) {
        const attachInsert = await client.query(
          `INSERT INTO task_attachments (task_log_id, file_path, file_name, file_size, mime_type, file_data)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, file_path, file_name, file_size, mime_type, created_at`,
          [
            session.task_log_id,
            storedFilePath,
            session.file_name,
            totalFileSize,
            session.mime_type,
            storedFileData,
          ]
        );
        attachRow = attachInsert.rows[0];

        const taskRes = await client.query(
          `SELECT task_id FROM task_logs WHERE id = $1`,
          [session.task_log_id]
        );
        resolvedTaskId = taskRes.rows[0]?.task_id;
      }

      // 5.4. Đánh dấu session hoàn tất & dọn dẹp file tạm
      await client.query(
        `UPDATE upload_sessions 
         SET bytes_uploaded = $1, chunks_received = chunks_received + 1, status = 'completed', attachment_id = $2, updated_at = NOW() 
         WHERE id = $3`,
        [totalFileSize, attachRow?.id || null, session.id]
      );

      await client.query("COMMIT");

      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch (cleanErr) {
        console.warn("Không thể xóa file tạm:", cleanErr.message);
      }

      return res.status(200).json({
        session_id: sessionId,
        status: "completed",
        bytes_uploaded: totalFileSize,
        offset: totalFileSize,
        is_completed: true,
        attachment: attachRow
          ? {
              id: attachRow.id,
              task_log_id: session.task_log_id,
              file_name: attachRow.file_name,
              file_size: attachRow.file_size,
              mime_type: attachRow.mime_type,
              url: formatAttachmentUrl(projectId, resolvedTaskId, session.task_log_id, attachRow),
            }
          : null,
      });
    }

    // 6. Chưa xong toàn bộ file -> Cập nhật tiến độ
    await client.query(
      `UPDATE upload_sessions 
       SET bytes_uploaded = $1, chunks_received = chunks_received + 1, updated_at = NOW() 
       WHERE id = $2`,
      [newBytesUploaded, session.id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      session_id: sessionId,
      bytes_uploaded: newBytesUploaded,
      offset: newBytesUploaded,
      status: "active",
      progress: Math.round((newBytesUploaded / totalFileSize) * 100),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

router.patch(
  "/:projectId/upload-sessions/:sessionId/chunk",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  rawChunkParser,
  chunkUpload.single("chunk"),
  asyncHandler(handleChunkUpload)
);

router.post(
  "/:projectId/upload-sessions/:sessionId/chunk",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  rawChunkParser,
  chunkUpload.single("chunk"),
  asyncHandler(handleChunkUpload)
);

/**
 * DELETE /api/projects/:projectId/upload-sessions/:sessionId
 * Hủy bỏ session và xóa tệp tạm
 */
router.delete(
  "/:projectId/upload-sessions/:sessionId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const { sessionId } = req.params;

    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!sessionId || !/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
      return res.status(400).json({ message: "sessionId không hợp lệ" });
    }

    const result = await db.query(
      `SELECT * FROM upload_sessions WHERE session_id = $1 AND project_id = $2`,
      [sessionId, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Upload session không tồn tại" });
    }

    const session = result.rows[0];
    if (session.temp_file_path && fs.existsSync(session.temp_file_path)) {
      try {
        fs.unlinkSync(session.temp_file_path);
      } catch (e) {
        // ignore
      }
    }

    await db.query(
      `UPDATE upload_sessions SET status = 'aborted', updated_at = NOW() WHERE id = $1`,
      [session.id]
    );

    return res.json({ message: "Đã hủy upload session thành công" });
  })
);

module.exports = router;
