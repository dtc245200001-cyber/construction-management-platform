"use strict";

const pool = require("../config/db");
const {
  multiplyAndRoundHalfUp0,
  addCurrency,
  formatTwoDecimals,
} = require("../utils/paymentMath");

/**
 * Service xử lý nghiệp vụ Đề nghị thanh toán (S-43 / T-112).
 */
class PaymentRequestService {
  /**
   * Lập đề nghị thanh toán từ phiếu nghiệm thu đã duyệt trong kỳ.
   */
  async createPaymentRequest({
    projectId,
    userId,
    period_start,
    period_end,
    acceptance_ids,
  }) {
    // 1. Kiểm tra định dạng ngày
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!period_start || !dateRegex.test(period_start)) {
      const err = new Error("period_start không hợp lệ (định dạng YYYY-MM-DD)");
      err.status = 400;
      throw err;
    }
    if (!period_end || !dateRegex.test(period_end)) {
      const err = new Error("period_end không hợp lệ (định dạng YYYY-MM-DD)");
      err.status = 400;
      throw err;
    }
    if (period_end < period_start) {
      const err = new Error("period_end phải lớn hơn hoặc bằng period_start");
      err.status = 400;
      throw err;
    }

    // 2. Kiểm tra acceptance_ids nếu được truyền lên
    const hasSpecifiedAcceptanceIds =
      acceptance_ids !== undefined && acceptance_ids !== null;
    let specifiedIds = [];
    if (hasSpecifiedAcceptanceIds) {
      if (!Array.isArray(acceptance_ids) || acceptance_ids.length === 0) {
        const err = new Error("acceptance_ids phải là mảng không rỗng các số nguyên dương");
        err.status = 400;
        throw err;
      }
      for (const id of acceptance_ids) {
        const num = Number(id);
        if (!Number.isInteger(num) || num <= 0) {
          const err = new Error(`acceptance_ids chứa ID không hợp lệ: "${id}"`);
          err.status = 400;
          throw err;
        }
        specifiedIds.push(num);
      }
      specifiedIds = [...new Set(specifiedIds)].sort((a, b) => a - b);
    }

    // 3. Khởi tạo transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let eligibleVoucherIds = [];

      if (hasSpecifiedAcceptanceIds) {
        // Kiểm tra các phiếu được chỉ định
        const checkRes = await client.query(
          `SELECT id, project_id, status, reviewed_at::date::text as reviewed_date
           FROM acceptance_vouchers
           WHERE id = ANY($1::int[])`,
          [specifiedIds]
        );

        if (checkRes.rows.length !== specifiedIds.length) {
          const err = new Error("Một hoặc nhiều phiếu nghiệm thu không hợp lệ hoặc không thuộc dự án");
          err.status = 400;
          throw err;
        }

        for (const v of checkRes.rows) {
          // Bảo vệ: không để lộ dữ liệu dự án khác
          if (Number(v.project_id) !== Number(projectId)) {
            const err = new Error("Một hoặc nhiều phiếu nghiệm thu không hợp lệ hoặc không thuộc dự án");
            err.status = 400;
            throw err;
          }
          if (v.status !== "approved") {
            const err = new Error(`Phiếu nghiệm thu #${v.id} chưa được duyệt`);
            err.status = 400;
            throw err;
          }
          if (!v.reviewed_date || v.reviewed_date < period_start || v.reviewed_date > period_end) {
            const err = new Error(`Ngày duyệt của phiếu nghiệm thu #${v.id} không nằm trong kỳ thanh toán`);
            err.status = 400;
            throw err;
          }
        }

        // Kiểm tra phiếu đã thuộc đề nghị hiệu lực khác chưa
        const conflictRes = await client.query(
          `SELECT pra.acceptance_id, pr.id as payment_request_id
           FROM payment_request_acceptances pra
           JOIN payment_requests pr ON pr.id = pra.payment_request_id
           WHERE pra.acceptance_id = ANY($1::int[])
             AND pra.released_at IS NULL`,
          [specifiedIds]
        );

        if (conflictRes.rows.length > 0) {
          const conflictId = conflictRes.rows[0].acceptance_id;
          const err = new Error(`Phiếu nghiệm thu #${conflictId} đã nằm trong một đề nghị thanh toán khác đang hiệu lực`);
          err.status = 409;
          throw err;
        }

        // Khóa các dòng phiếu theo thứ tự ID cố định để tránh deadlock
        await client.query(
          `SELECT id FROM acceptance_vouchers
           WHERE id = ANY($1::int[])
           ORDER BY id ASC
           FOR UPDATE`,
          [specifiedIds]
        );

        eligibleVoucherIds = specifiedIds;
      } else {
        // Tự động tìm các phiếu thỏa mãn điều kiện và khóa FOR UPDATE
        const autoVouchersRes = await client.query(
          `SELECT av.id
           FROM acceptance_vouchers av
           WHERE av.project_id = $1
             AND av.status = 'approved'
             AND av.reviewed_at::date >= $2::date
             AND av.reviewed_at::date <= $3::date
             AND NOT EXISTS (
               SELECT 1 FROM payment_request_acceptances pra
               WHERE pra.acceptance_id = av.id AND pra.released_at IS NULL
             )
           ORDER BY av.id ASC
           FOR UPDATE`,
          [projectId, period_start, period_end]
        );

        if (autoVouchersRes.rows.length === 0) {
          const err = new Error("Không có phiếu nghiệm thu nào đủ điều kiện để lập đề nghị thanh toán trong kỳ này");
          err.status = 400;
          throw err;
        }

        eligibleVoucherIds = autoVouchersRes.rows.map((r) => r.id);
      }

      // 4. Lấy chi tiết các hạng mục và đơn giá hợp đồng hiện tại (snapshot)
      const itemsRes = await client.query(
        `SELECT avi.voucher_id as acceptance_id,
                avi.work_item_id,
                avi.delta_quantity::text as quantity,
                wi.name as work_item_name,
                wi.code as work_item_code,
                wi.unit,
                wi.unit_price::text as unit_price
         FROM acceptance_voucher_items avi
         JOIN work_items wi ON wi.id = avi.work_item_id
         WHERE avi.voucher_id = ANY($1::int[])
         ORDER BY avi.voucher_id ASC, avi.work_item_id ASC, avi.id ASC`,
        [eligibleVoucherIds]
      );

      // Kiểm tra hạng mục thiếu đơn giá hợp đồng
      const missingPrices = [];
      for (const item of itemsRes.rows) {
        if (item.unit_price === null || item.unit_price === undefined || item.unit_price === "") {
          missingPrices.push(item.work_item_name || `Hạng mục ID ${item.work_item_id}`);
        }
      }

      if (missingPrices.length > 0) {
        const uniqueMissing = [...new Set(missingPrices)];
        const err = new Error(`Hạng mục thiếu đơn giá hợp đồng: ${uniqueMissing.join(", ")}`);
        err.status = 400;
        err.missing_work_items = uniqueMissing;
        throw err;
      }

      // 5. Tính thành tiền từng dòng và tổng đề nghị bằng BigInt Decimal
      const linesToInsert = [];
      const lineAmounts = [];
      for (const item of itemsRes.rows) {
        const lineAmount = multiplyAndRoundHalfUp0(item.quantity, item.unit_price);
        lineAmounts.push(lineAmount);
        linesToInsert.push({
          acceptance_id: item.acceptance_id,
          work_item_id: item.work_item_id,
          work_item_name: item.work_item_name,
          work_item_code: item.work_item_code,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: lineAmount,
        });
      }

      const totalAmount = addCurrency(lineAmounts);
      if (totalAmount.startsWith("-")) {
        const err = new Error("Tổng giá trị đề nghị thanh toán không được âm");
        err.status = 400;
        throw err;
      }

      // 6. Chèn bảng payment_requests (header)
      const prRes = await client.query(
        `INSERT INTO payment_requests (
           project_id, period_start, period_end, status, total_amount, created_by
         ) VALUES ($1, $2, $3, 'DRAFT', $4, $5)
         RETURNING id, project_id, period_start, period_end, status,
                   total_amount::text as total_amount, created_by, created_at, updated_at`,
        [projectId, period_start, period_end, totalAmount, userId]
      );
      const paymentRequestId = prRes.rows[0].id;

      // S-44 / T-114: lưu mốc trạng thái ban đầu để UI có lịch sử đầy đủ.
      await client.query(
        `INSERT INTO payment_request_status_history (
           payment_request_id, project_id, action, from_status, to_status, reason, acted_by
         ) VALUES ($1, $2, 'CREATED', NULL, 'DRAFT', NULL, $3)`,
        [paymentRequestId, projectId, userId]
      );

      // 7. Chèn bảng payment_request_acceptances (liên kết phiếu)
      for (const accId of eligibleVoucherIds) {
        await client.query(
          `INSERT INTO payment_request_acceptances (
             payment_request_id, acceptance_id, released_at
           ) VALUES ($1, $2, NULL)`,
          [paymentRequestId, accId]
        );
      }

      // 8. Chèn bảng payment_request_lines (chi tiết từng dòng)
      const insertedLines = [];
      for (const line of linesToInsert) {
        const lineRes = await client.query(
          `INSERT INTO payment_request_lines (
             payment_request_id, acceptance_id, work_item_id, quantity, unit_price, amount
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, payment_request_id, acceptance_id, work_item_id,
                     quantity::text as quantity, unit_price::text as unit_price,
                     amount::text as amount, created_at`,
          [
            paymentRequestId,
            line.acceptance_id,
            line.work_item_id,
            line.quantity,
            line.unit_price,
            line.amount,
          ]
        );

        insertedLines.push({
          ...lineRes.rows[0],
          work_item_name: line.work_item_name,
          work_item_code: line.work_item_code,
          unit: line.unit,
        });
      }

      // 9. Đối soát tổng tiền trước khi COMMIT
      const dbSumRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::text as db_total
         FROM payment_request_lines
         WHERE payment_request_id = $1`,
        [paymentRequestId]
      );

      const dbTotalFormatted = formatTwoDecimals(dbSumRes.rows[0].db_total);
      const totalAmountFormatted = formatTwoDecimals(totalAmount);

      if (dbTotalFormatted !== totalAmountFormatted) {
        throw new Error(
          `Đối soát tổng tiền thất bại: tính toán=${totalAmountFormatted}, db_sum=${dbTotalFormatted}`
        );
      }

      await client.query("COMMIT");

      return {
        ...prRes.rows[0],
        acceptances: eligibleVoucherIds,
        lines: insertedLines,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      // Bắt lỗi partial unique index (chốt chặn cuối DB chống race condition)
      if (
        err.code === "23505" ||
        (err.constraint &&
          err.constraint.includes("payment_request_acceptances_active_acceptance_unique"))
      ) {
        const conflictErr = new Error("Phiếu nghiệm thu đã nằm trong một đề nghị thanh toán khác đang hiệu lực");
        conflictErr.status = 409;
        throw conflictErr;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lấy danh sách đề nghị thanh toán của dự án.
   */
  async getPaymentRequestsByProject(projectId) {
    const res = await pool.query(
      `SELECT pr.id,
              pr.project_id,
              pr.period_start,
              pr.period_end,
              pr.status,
              pr.total_amount::text as total_amount,
              pr.created_by,
              u.name as creator_name,
              pr.reviewed_by,
              reviewer.name as reviewer_name,
              pr.reviewed_at,
              pr.return_reason,
              pr.created_at,
              pr.updated_at,
              COUNT(DISTINCT pra.acceptance_id)::int as acceptance_count,
              COUNT(prl.id)::int as line_count
       FROM payment_requests pr
       LEFT JOIN users u ON u.id = pr.created_by
       LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
       LEFT JOIN payment_request_acceptances pra ON pra.payment_request_id = pr.id
       LEFT JOIN payment_request_lines prl ON prl.payment_request_id = pr.id
       WHERE pr.project_id = $1
       GROUP BY pr.id, u.name, reviewer.name
       ORDER BY pr.created_at DESC, pr.id DESC`,
      [projectId]
    );

    return res.rows;
  }

  /**
   * Lấy chi tiết một đề nghị thanh toán kèm danh sách phiếu và dòng chi tiết.
   */
  async getPaymentRequestDetail(projectId, paymentRequestId) {
    // 1. Kiểm tra header đề nghị
    const headerRes = await pool.query(
      `SELECT pr.id,
              pr.project_id,
              pr.period_start,
              pr.period_end,
              pr.status,
              pr.total_amount::text as total_amount,
              pr.created_by,
              u.name as creator_name,
              pr.reviewed_by,
              reviewer.name as reviewer_name,
              pr.reviewed_at,
              pr.return_reason,
              pr.created_at,
              pr.updated_at
       FROM payment_requests pr
       LEFT JOIN users u ON u.id = pr.created_by
       LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
       WHERE pr.id = $1 AND pr.project_id = $2`,
      [paymentRequestId, projectId]
    );

    if (headerRes.rows.length === 0) {
      const err = new Error("Không tìm thấy đề nghị thanh toán");
      err.status = 404;
      throw err;
    }

    const header = headerRes.rows[0];

    // 2. Lấy danh sách phiếu nghiệm thu liên kết
    const accRes = await pool.query(
      `SELECT pra.id,
              pra.acceptance_id,
              pra.released_at,
              pra.created_at,
              av.batch_name,
              av.status as voucher_status,
              av.reviewed_at
       FROM payment_request_acceptances pra
       JOIN acceptance_vouchers av ON av.id = pra.acceptance_id
       WHERE pra.payment_request_id = $1
       ORDER BY pra.acceptance_id ASC`,
      [paymentRequestId]
    );

    // 3. Lấy chi tiết từng dòng
    const linesRes = await pool.query(
      `SELECT prl.id,
              prl.acceptance_id,
              prl.work_item_id,
              prl.quantity::text as quantity,
              prl.unit_price::text as unit_price,
              prl.amount::text as amount,
              wi.name as work_item_name,
              wi.code as work_item_code,
              wi.unit,
              av.batch_name as acceptance_batch_name,
              prl.created_at
       FROM payment_request_lines prl
       JOIN work_items wi ON wi.id = prl.work_item_id
       JOIN acceptance_vouchers av ON av.id = prl.acceptance_id
       WHERE prl.payment_request_id = $1
       ORDER BY prl.acceptance_id ASC, prl.id ASC`,
      [paymentRequestId]
    );

    // 4. Lịch sử trạng thái (created/approved/returned) kèm người thao tác.
    const historyRes = await pool.query(
      `SELECT h.id,
              h.action,
              h.from_status,
              h.to_status,
              h.reason,
              h.acted_by,
              u.name as acted_by_name,
              h.acted_at
       FROM payment_request_status_history h
       LEFT JOIN users u ON u.id = h.acted_by
       WHERE h.payment_request_id = $1 AND h.project_id = $2
       ORDER BY h.acted_at ASC, h.id ASC`,
      [paymentRequestId, projectId]
    );

    return {
      ...header,
      acceptances: accRes.rows,
      lines: linesRes.rows,
      history: historyRes.rows,
    };
  }

  /**
   * S-44 / T-114: Chủ đầu tư duyệt đề nghị DRAFT.
   * APPROVED/RETURNED là trạng thái cuối của đề nghị này.
   */
  async approvePaymentRequest({ projectId, paymentRequestId, userId }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const currentRes = await client.query(
        `SELECT id, project_id, status
         FROM payment_requests
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [paymentRequestId, projectId]
      );

      if (currentRes.rows.length === 0) {
        const err = new Error("Không tìm thấy đề nghị thanh toán");
        err.status = 404;
        throw err;
      }

      const current = currentRes.rows[0];
      if (current.status !== "DRAFT") {
        const err = new Error(
          current.status === "APPROVED"
            ? "Đề nghị thanh toán đã duyệt và đã bị khóa"
            : "Đề nghị thanh toán đã bị trả lại, không thể duyệt lại"
        );
        err.status = 409;
        err.code = "PAYMENT_REQUEST_LOCKED";
        throw err;
      }

      const updatedRes = await client.query(
        `UPDATE payment_requests
         SET status = 'APPROVED',
             reviewed_by = $1,
             reviewed_at = NOW(),
             return_reason = NULL,
             updated_at = NOW()
         WHERE id = $2 AND project_id = $3
         RETURNING id, project_id, period_start, period_end, status,
                   total_amount::text as total_amount, created_by,
                   reviewed_by, reviewed_at, return_reason, created_at, updated_at`,
        [userId, paymentRequestId, projectId]
      );

      await client.query(
        `INSERT INTO payment_request_status_history (
           payment_request_id, project_id, action, from_status, to_status, reason, acted_by
         ) VALUES ($1, $2, 'APPROVED', 'DRAFT', 'APPROVED', NULL, $3)`,
        [paymentRequestId, projectId, userId]
      );

      await client.query("COMMIT");
      return updatedRes.rows[0];
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * S-44 / T-114: Chủ đầu tư trả lại đề nghị DRAFT, bắt buộc lý do.
   * Khi trả lại, toàn bộ phiếu nghiệm thu được release để có thể lập đề nghị khác.
   */
  async returnPaymentRequest({ projectId, paymentRequestId, userId, reason }) {
    const normalizedReason = typeof reason === "string" ? reason.trim() : "";
    if (!normalizedReason) {
      const err = new Error("Bắt buộc nhập lý do trả lại đề nghị thanh toán");
      err.status = 400;
      err.code = "RETURN_REASON_REQUIRED";
      throw err;
    }
    if (normalizedReason.length > 2000) {
      const err = new Error("Lý do trả lại không được vượt quá 2000 ký tự");
      err.status = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const currentRes = await client.query(
        `SELECT id, project_id, status
         FROM payment_requests
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [paymentRequestId, projectId]
      );

      if (currentRes.rows.length === 0) {
        const err = new Error("Không tìm thấy đề nghị thanh toán");
        err.status = 404;
        throw err;
      }

      const current = currentRes.rows[0];
      if (current.status !== "DRAFT") {
        const err = new Error(
          current.status === "APPROVED"
            ? "Đề nghị thanh toán đã duyệt và đã bị khóa"
            : "Đề nghị thanh toán đã bị trả lại trước đó"
        );
        err.status = 409;
        err.code = "PAYMENT_REQUEST_LOCKED";
        throw err;
      }

      const updatedRes = await client.query(
        `UPDATE payment_requests
         SET status = 'RETURNED',
             reviewed_by = $1,
             reviewed_at = NOW(),
             return_reason = $2,
             updated_at = NOW()
         WHERE id = $3 AND project_id = $4
         RETURNING id, project_id, period_start, period_end, status,
                   total_amount::text as total_amount, created_by,
                   reviewed_by, reviewed_at, return_reason, created_at, updated_at`,
        [userId, normalizedReason, paymentRequestId, projectId]
      );

      await client.query(
        `UPDATE payment_request_acceptances
         SET released_at = NOW()
         WHERE payment_request_id = $1 AND released_at IS NULL`,
        [paymentRequestId]
      );

      await client.query(
        `INSERT INTO payment_request_status_history (
           payment_request_id, project_id, action, from_status, to_status, reason, acted_by
         ) VALUES ($1, $2, 'RETURNED', 'DRAFT', 'RETURNED', $3, $4)`,
        [paymentRequestId, projectId, normalizedReason, userId]
      );

      await client.query("COMMIT");
      return updatedRes.rows[0];
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new PaymentRequestService();
