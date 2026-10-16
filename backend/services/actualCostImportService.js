"use strict";

const db = require("../config/db");
const { validateCost } = require("./actualCostService");

const MAX_ROWS = 1000;
const REQUIRED_COLUMNS = [
  "work_item_id",
  "amount",
  "description",
  "expense_date",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (closedQuote) {
      if (char === ",") {
        row.push(field);
        field = "";
        closedQuote = false;
      } else if (char === "\n" || char === "\r") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        closedQuote = false;
        if (char === "\r" && text[i + 1] === "\n") i++;
      } else if (char !== " " && char !== "\t") {
        throw new Error("Ky tu khong hop le sau dau ngoac kep");
      }
      continue;
    }

    if (char === '"') {
      if (field !== "") {
        throw new Error("Dau ngoac kep khong hop le");
      }
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error("CSV co truong chua dong dau ngoac kep");
  }

  if (field !== "" || row.length > 0 || closedQuote) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

async function importActualCosts({ projectId, userId, buffer }) {
  let rows;

  try {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    rows = parseCsv(text);
  } catch (err) {
    return {
      status: 400,
      error: "File CSV khong hop le",
      details: err.message,
    };
  }

  if (rows.length < 2) {
    return { status: 400, error: "CSV phai co header va it nhat mot dong du lieu" };
  }

  const headers = rows[0].map((value) => value.trim());

  if (
    headers.length !== REQUIRED_COLUMNS.length ||
    new Set(headers).size !== REQUIRED_COLUMNS.length ||
    !REQUIRED_COLUMNS.every((column) => headers.includes(column))
  ) {
    return {
      status: 400,
      error: "Header CSV phai gom work_item_id,amount,description,expense_date",
    };
  }

  const records = rows.slice(1).filter(
    (row) => !(row.length === 1 && row[0].trim() === "")
  );

  if (records.length === 0 || records.length > MAX_ROWS) {
    return {
      status: 400,
      error: "CSV phai co tu 1 den 1000 dong du lieu",
    };
  }

  const errors = [];
  const validRecords = [];

  records.forEach((row, index) => {
    const line = index + 2;

    if (row.length !== headers.length) {
      errors.push({ line, error: "So cot khong khop header" });
      return;
    }

    const data = Object.fromEntries(
      headers.map((header, i) => [header, row[i]])
    );

    const result = validateCost(data);

    if (!result.valid) {
      errors.push({ line, errors: result.errors });
    } else {
      validRecords.push(result.value);
    }
  });

  if (errors.length > 0) {
    return {
      status: 400,
      error: "CSV co du lieu khong hop le",
      errors,
    };
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const workItemIds = [
      ...new Set(validRecords.map((record) => record.work_item_id)),
    ];

    const found = await client.query(
      `SELECT id FROM work_items
       WHERE project_id = $1 AND id = ANY($2::int[])`,
      [projectId, workItemIds]
    );

    const allowedIds = new Set(found.rows.map((row) => row.id));

    validRecords.forEach((record, index) => {
      if (!allowedIds.has(record.work_item_id)) {
        errors.push({
          line: index + 2,
          error: "Hang muc khong thuoc du an",
          work_item_id: record.work_item_id,
        });
      }
    });

    if (errors.length > 0) {
      await client.query("ROLLBACK");
      return {
        status: 400,
        error: "CSV chua hang muc khong hop le",
        errors,
      };
    }

    const inserted = [];

    for (const record of validRecords) {
      const result = await client.query(
        `INSERT INTO actual_costs
         (project_id, work_item_id, amount, description, expense_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, project_id, work_item_id, amount::text,
                   description, expense_date::text, created_by, created_at`,
        [
          projectId,
          record.work_item_id,
          record.amount,
          record.description,
          record.expense_date,
          userId,
        ]
      );

      inserted.push(result.rows[0]);
    }

    await client.query("COMMIT");

    return {
      status: 201,
      imported: inserted.length,
      actual_costs: inserted,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  parseCsv,
  importActualCosts,
};
