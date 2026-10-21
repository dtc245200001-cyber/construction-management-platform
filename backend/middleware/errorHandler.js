// middleware/errorHandler.js — Xử lý lỗi tập trung.
//
// notFoundHandler: bắt mọi route không khớp → 404 JSON.
// errorHandler: bắt lỗi do next(err) hoặc async route throw → JSON.
//   - Production: không lộ stack, và ẩn message của lỗi 5xx.
//   - Development: trả thêm stack để debug.

"use strict";

const logger = require("../utils/logger");

/**
 * 404 handler — đặt SAU tất cả route, TRƯỚC errorHandler.
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    message: "Không tìm thấy đường dẫn này",
  });
}

/**
 * Error handler — đặt CUỐI middleware stack.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  logger.error(
    {
      err: {
        message: err.message,
        code: err.code,
      },
      req: {
        method: req.method,
        url: req.url,
      },
    },
    "Lỗi xử lý request"
  );

  const isProd = process.env.NODE_ENV === "production";

  // T-25: trả thông tin vòng phụ thuộc để frontend hiển thị
  // tên công việc thay vì chỉ ID.
  if (err.code === "DEPENDENCY_CYCLE") {
    return res.status(status).json({
      code: err.code,
      message: err.message,
      cycleNames: err.cycleNames || [],
      cyclePath: err.cyclePath || "",
    });
  }

  // T-85 & T-86: Ánh xạ lỗi cơ sở dữ liệu Postgres cho khối lượng và đơn giá hợp đồng
  if (err.code === "23514") {
    // S-37: trigger kiểm tra nghiệm thu dùng RAISE EXCEPTION với SQLSTATE 23514
    // nhưng không gắn tên constraint. Nếu không ánh xạ riêng, production sẽ
    // biến lỗi nghiệp vụ này thành 500 "Lỗi máy chủ", khiến T-98 không biết
    // vì sao phiếu không được duyệt. Chỉ công khai các message nghiệp vụ đã biết.
    const acceptanceMessage = String(err.message || "");
    const isAcceptanceValidation =
      acceptanceMessage.includes("không có khối lượng hợp đồng hợp lệ") ||
      acceptanceMessage.includes("vượt hợp đồng") ||
      acceptanceMessage.includes("có lũy kế thấp hơn mức đã duyệt") ||
      acceptanceMessage.includes("Cannot change status of an approved acceptance voucher") ||
      acceptanceMessage.includes("Cannot modify items of an approved acceptance voucher") ||
      acceptanceMessage.includes("Cannot add or move items into an approved acceptance voucher") ||
      acceptanceMessage.includes("Contract quantity cannot be lower than approved quantity");

    if (isAcceptanceValidation) {
      let friendlyMessage = acceptanceMessage;
      if (acceptanceMessage.includes("Contract quantity cannot be lower than approved quantity")) {
        friendlyMessage = "Không thể xóa hoặc giảm khối lượng hợp đồng vì hạng mục này đã có trong biên bản nghiệm thu.";
      }
      return res.status(422).json({
        code: "ACCEPTANCE_CONTRACT_VALIDATION_FAILED",
        message: friendlyMessage,
      });
    }

    if (err.constraint === "work_items_contract_leaf_only") {
      return res.status(422).json({
        message: err.message || "Hạng mục cha không khai khối lượng hợp đồng trực tiếp; hãy khai ở các hạng mục lá bên dưới",
      });
    }
    if (err.constraint === "work_items_contract_all_or_none") {
      return res.status(400).json({
        message: "Phải khai đồng thời cả khối lượng, đơn vị và đơn giá hoặc để trống cả ba",
      });
    }
    if (err.constraint === "work_items_quantity_non_negative") {
      return res.status(400).json({
        message: "Khối lượng hợp đồng không được âm",
      });
    }
    if (err.constraint === "work_items_unit_price_non_negative") {
      return res.status(400).json({
        message: "Đơn giá hợp đồng không được âm",
      });
    }
    if (err.constraint === "work_items_unit_trimmed_not_empty") {
      return res.status(400).json({
        message: "Đơn vị tính không được rỗng hoặc chứa khoảng trắng thừa",
      });
    }

    // T-118: Ánh xạ lỗi ràng buộc dự toán
    if (err.constraint === "budget_items_leaf_only") {
      return res.status(422).json({
        message: err.message || "Chỉ được nhập dự toán cho hạng mục lá, không nhập trực tiếp ở hạng mục cha",
      });
    }
    if (err.constraint === "budget_items_project_match") {
      return res.status(422).json({
        message: err.message || "Hạng mục không thuộc dự án của phiên bản dự toán",
      });
    }
    if (err.constraint === "budget_items_amount_non_negative") {
      return res.status(400).json({
        message: "Số tiền dự toán không được âm",
      });
    }
    if (err.constraint === "budget_versions_version_positive") {
      return res.status(400).json({
        message: "Số phiên bản dự toán phải lớn hơn hoặc bằng 1",
      });
    }
  }

  if (err.code === "23505" && err.constraint === "budget_versions_project_version_unique") {
    return res.status(409).json({
      message: "Phiên bản dự toán này đã tồn tại trong dự án",
    });
  }

  if (err.code === "22003") {
    return res.status(400).json({
      message: "Giá trị vượt giới hạn cho phép",
    });
  }

  // Lỗi 5xx: ẩn chi tiết ở production.
  // Lỗi 4xx là lỗi của người gọi, giữ nguyên message.
  const hideDetail = isProd && status >= 500;

  res.status(status).json({
    message: hideDetail ? "Lỗi máy chủ" : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};