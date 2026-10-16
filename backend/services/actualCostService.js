"use strict";

const db = require("../config/db");

function validateCost(data) {
  const errors = {};

  const workItemId = Number(data.work_item_id);
  if (!Number.isSafeInteger(workItemId) || workItemId <= 0) {
    errors.work_item_id = "Hạng mục không hợp lệ";
  }

  const amount = data.amount;
  const amountText = String(amount ?? "").trim();

  if (
    !/^\d{1,14}(\.\d{1,2})?$/.test(amountText) ||
    !/[1-9]/.test(amountText)
  ) {
    errors.amount = "Số tiền phải lớn hơn 0 và có tối đa 2 chữ số thập phân";
  }

  const description =
    typeof data.description === "string" ? data.description.trim() : "";

  if (!description || description.length > 2000) {
    errors.description = "Nội dung chi phí phải có từ 1 đến 2000 ký tự";
  }

  const expenseDate = data.expense_date;

  if (
    typeof expenseDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ||
    Number.isNaN(Date.parse(expenseDate)) ||
    new Date(expenseDate).toISOString().slice(0, 10) !== expenseDate
  ) {
    errors.expense_date = "Ngày chi phí phải có định dạng YYYY-MM-DD hợp lệ";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      work_item_id: workItemId,
      amount: amountText,
      description,
      expense_date: expenseDate,
    },
  };
}

async function createActualCost({ projectId, userId, data }) {
  const validation = validateCost(data);

  if (!validation.valid) {
    return { status: 400, errors: validation.errors };
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const workItem = await client.query(
      `SELECT id FROM work_items
       WHERE id = $1 AND project_id = $2`,
      [validation.value.work_item_id, projectId]
    );

    if (workItem.rowCount === 0) {
      await client.query("ROLLBACK");
      return { status: 404, error: "Không tìm thấy hạng mục thuộc dự án" };
    }

    const result = await client.query(
      `INSERT INTO actual_costs
       (project_id, work_item_id, amount, description, expense_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id, work_item_id,
                 amount::text, description,
                 expense_date::text, created_by, created_at`,
      [
        projectId,
        validation.value.work_item_id,
        validation.value.amount,
        validation.value.description,
        validation.value.expense_date,
        userId,
      ]
    );

    await client.query("COMMIT");

    return { status: 201, cost: result.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function getActualCosts(projectId) {
  const result = await db.query(
    `SELECT ac.id, ac.project_id, ac.work_item_id,
            wi.code AS work_item_code,
            wi.name AS work_item_name,
            ac.amount::text, ac.description,
            ac.expense_date::text, ac.created_by, ac.created_at
     FROM actual_costs ac
     JOIN work_items wi ON wi.id = ac.work_item_id
     WHERE ac.project_id = $1
     ORDER BY ac.expense_date DESC, ac.id DESC`,
    [projectId]
  );

  return result.rows;
}

module.exports = {
  validateCost,
  createActualCost,
  getActualCosts,
};
