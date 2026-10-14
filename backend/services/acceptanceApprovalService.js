
"use strict";

/**
 * S-37 / T-94
 * Khóa các hạng mục khi xử lý duyệt nghiệm thu.
 *
 * Phải gọi trong transaction đã BEGIN.
 * Cần giữ khóa đến khi COMMIT hoặc ROLLBACK.
 */

async function lockAcceptanceWorkItems(client, workItemIds) {
  if (!client || typeof client.query !== "function") {
    throw new Error("Cần PostgreSQL transaction client");
  }

  if (!Array.isArray(workItemIds) || workItemIds.length === 0) {
    throw new Error("Danh sách hạng mục không được rỗng");
  }

  const ids = [...new Set(workItemIds.map(Number))].sort(
    (a, b) => a - b
  );

  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("ID hạng mục không hợp lệ");
  }

  // Khóa lần lượt theo ID để giảm nguy cơ deadlock.
  // Dùng một transaction client xuyên suốt.
  const rows = [];

  for (const id of ids) {
    const result = await client.query(
      `SELECT id, project_id, quantity::text AS contract_quantity
       FROM work_items
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (result.rowCount !== 1) {
      const error = new Error(`Không tìm thấy hạng mục ${id}`);
      error.status = 404;
      throw error;
    }

    rows.push(result.rows[0]);
  }

  return rows;
}

/**
 * S-37 / T-95, T-96
 * Kiểm tra lũy kế đề nghị không vượt khối lượng hợp đồng.
 * Sử dụng BigInt để tránh sai số số thực.
 */

function toMillis(value) {
  const text = String(value).trim();

  if (!/^\d+(\.\d{1,3})?$/.test(text)) {
    throw new Error(`Khối lượng không hợp lệ: ${text}`);
  }

  const [whole, decimal = ""] = text.split(".");
  return BigInt(whole) * 1000n +
    BigInt(decimal.padEnd(3, "0"));
}

function fromMillis(value) {
  const whole = value / 1000n;
  const decimal = (value % 1000n).toString().padStart(3, "0");
  return `${whole}.${decimal}`;
}

function validateContractQuantity({
  workItemId,
  contractQuantity,
  approvedQuantity,
  requestedQuantity,
}) {
  const contract = toMillis(contractQuantity);
  const approved = toMillis(approvedQuantity);
  const requested = toMillis(requestedQuantity);

  // Phiếu nghiệm thu lưu khối lượng lũy kế, không phải phần tăng thêm.
  const excess = requested - contract;

  if (excess > 0n) {
    const error = new Error(
      `Hạng mục ${workItemId}: khối lượng nghiệm thu vượt hợp đồng`
    );

    error.status = 422;
    error.code = "ACCEPTANCE_EXCEEDS_CONTRACT";
    error.details = {
      work_item_id: workItemId,
      contract_quantity: fromMillis(contract),
      approved_quantity: fromMillis(approved),
      requested_quantity: fromMillis(requested),
      excess_quantity: fromMillis(excess),
    };

    throw error;
  }

  return {
    work_item_id: workItemId,
    contract_quantity: fromMillis(contract),
    approved_quantity: fromMillis(approved),
    requested_quantity: fromMillis(requested),
    remaining_quantity: fromMillis(contract - requested),
  };
}

/**
 * S-37 / T-94, T-95, T-96
 * Kiểm tra giới hạn nghiệm thu bên trong transaction.
 *
 * Điều kiện:
 * - client đã BEGIN.
 * - Không COMMIT trước khi hoàn tất duyệt.
 * - Mọi luồng duyệt phải dùng chung cơ chế khóa này.
 */
async function checkVoucherContractLimits(client, projectId, voucherId) {
  if (!client || typeof client.query !== "function") {
    throw new Error("Cần PostgreSQL transaction client");
  }

  const voucherResult = await client.query(
    `SELECT id, project_id, status
     FROM acceptance_vouchers
     WHERE id = $1 AND project_id = $2
     FOR UPDATE`,
    [voucherId, projectId]
  );

  if (voucherResult.rowCount !== 1) {
    const error = new Error("Không tìm thấy phiếu nghiệm thu");
    error.status = 404;
    throw error;
  }

  const voucher = voucherResult.rows[0];

  if (voucher.status !== "pending_review") {
    const error = new Error("Phiếu không ở trạng thái chờ duyệt");
    error.status = 409;
    throw error;
  }

  const itemsResult = await client.query(
    `SELECT work_item_id,
            cumulative_quantity::text AS requested_quantity
     FROM acceptance_voucher_items
     WHERE voucher_id = $1
     ORDER BY work_item_id`,
    [voucherId]
  );

  if (itemsResult.rows.length === 0) {
    const error = new Error("Phiếu nghiệm thu không có hạng mục");
    error.status = 422;
    throw error;
  }

  const lockedItems = await lockAcceptanceWorkItems(
    client,
    itemsResult.rows.map((item) => item.work_item_id)
  );

  const workItemsById = new Map(
    lockedItems.map((item) => [String(item.id), item])
  );

  const results = [];

  for (const item of itemsResult.rows) {
    const workItem = workItemsById.get(String(item.work_item_id));

    if (String(workItem.project_id) !== String(projectId)) {
      const error = new Error("Hạng mục không thuộc dự án");
      error.status = 422;
      throw error;
    }

    if (workItem.contract_quantity == null) {
      const error = new Error(
        `Hạng mục ${item.work_item_id} chưa có khối lượng hợp đồng`
      );
      error.status = 422;
      throw error;
    }

    // Đọc lại dữ liệu đã duyệt SAU KHI khóa work_items.
    const approvedResult = await client.query(
      `SELECT avi.cumulative_quantity::text AS approved_quantity
       FROM acceptance_voucher_items avi
       JOIN acceptance_vouchers av ON av.id = avi.voucher_id
       WHERE avi.work_item_id = $1
         AND av.project_id = $2
         AND av.status = 'approved'
       ORDER BY av.reviewed_at DESC NULLS LAST, av.id DESC
       LIMIT 1`,
      [item.work_item_id, projectId]
    );

    const approvedQuantity =
      approvedResult.rows[0]?.approved_quantity ?? "0";

    const validation = validateContractQuantity({
      workItemId: item.work_item_id,
      contractQuantity: workItem.contract_quantity,
      approvedQuantity,
      requestedQuantity: item.requested_quantity,
    });

    // Chặn duyệt lũy kế cũ hơn lũy kế đã được duyệt.
    if (
      toMillis(item.requested_quantity) <
      toMillis(approvedQuantity)
    ) {
      const error = new Error(
        `Hạng mục ${item.work_item_id}: lũy kế đề nghị thấp hơn lũy kế đã duyệt`
      );
      error.status = 422;
      error.code = "ACCEPTANCE_BELOW_APPROVED";
      error.details = validation;
      throw error;
    }

    results.push(validation);
  }

  return { voucher, items: results };
}

module.exports = {
  lockAcceptanceWorkItems,
  validateContractQuantity,
  checkVoucherContractLimits,
};