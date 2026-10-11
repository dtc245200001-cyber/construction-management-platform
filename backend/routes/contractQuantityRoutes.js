"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");
const {
  VALID_CONTRACT_UNITS,
  normalizeContractUnit,
} = require("../utils/contractUnits");
const { parseDecimalInput } = require("../utils/decimalInput");

const router = createProjectRouter();

// ─── KHỐI HẰNG SỐ PHÂN QUYỀN (Story S-35, Task T-86) ────────────────────────
const PERMISSIONS = {
  // Xem đầy đủ (bao gồm đơn giá, giá trị hợp đồng và tổng tiền)
  VIEW_FULL: [ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY, ROLES.KE_TOAN],
  // Chỉ xem khối lượng và đơn vị tính (bỏ hoàn toàn các trường giá)
  VIEW_QUANTITY_ONLY: [ROLES.KY_SU_GIAM_SAT, ROLES.CHI_HUY_TRUONG],
  // Được phép cập nhật hoặc xoá khối lượng hợp đồng
  MUTATE: [ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY],
};

const ALL_ALLOWED_VIEW = [
  ...PERMISSIONS.VIEW_FULL,
  ...PERMISSIONS.VIEW_QUANTITY_ONLY,
];

// ─── GET /api/projects/:projectId/contract-quantities ────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/contract-quantities:
 *   get:
 *     summary: Lấy danh sách khối lượng và giá trị hợp đồng các hạng mục theo dự án
 *     tags: [ContractQuantity]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: projectId không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.get(
  "/:projectId/contract-quantities",
  requireAuth,
  checkProjectAccess,
  allow(ALL_ALLOWED_VIEW),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const userRole = req.projectRole;
    const canViewPrices = PERMISSIONS.VIEW_FULL.includes(userRole);

    // Truy vấn cây hạng mục và tính tổng hợp đồng bằng CTE đệ quy chống chu trình
    const query = `
      WITH RECURSIVE
      item_meta AS (
        SELECT
          wi.id,
          wi.parent_id,
          wi.code,
          wi.name,
          (NOT EXISTS (
            SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
          )) AS is_leaf,
          wi.quantity,
          wi.unit,
          wi.unit_price,
          wi.contract_value
        FROM work_items wi
        WHERE wi.project_id = $1
      ),
      tree_descendants(ancestor_id, desc_id, depth, path) AS (
        SELECT
          id AS ancestor_id,
          id AS desc_id,
          1 AS depth,
          ARRAY[id] AS path
        FROM item_meta
        UNION ALL
        SELECT
          td.ancestor_id,
          im.id AS desc_id,
          td.depth + 1,
          td.path || im.id
        FROM tree_descendants td
        JOIN item_meta im ON im.parent_id = td.desc_id
        WHERE NOT (im.id = ANY(td.path)) AND td.depth < 100
      ),
      totals AS (
        SELECT
          td.ancestor_id AS id,
          COALESCE(
            ROUND(SUM(im.contract_value), 2)::text,
            '0.00'
          ) AS contract_total
        FROM tree_descendants td
        JOIN item_meta im ON im.id = td.desc_id
        GROUP BY td.ancestor_id
      )
      SELECT
        im.id,
        im.parent_id,
        im.code,
        im.name,
        im.is_leaf,
        im.quantity::text AS quantity,
        im.unit,
        im.unit_price::text AS unit_price,
        im.contract_value::text AS contract_value,
        COALESCE(t.contract_total, '0.00') AS contract_total
      FROM item_meta im
      LEFT JOIN totals t ON t.id = im.id
      ORDER BY im.id ASC;
    `;

    const { rows } = await db.query(query, [projectId]);

    // Tính project_total từ các hạng mục gốc (parent_id IS NULL)
    let projectTotal = "0.00";
    if (canViewPrices) {
      const rootTotals = await db.query(
        `
        WITH RECURSIVE
        item_meta AS (
          SELECT id, parent_id, contract_value
          FROM work_items
          WHERE project_id = $1
        ),
        tree_descendants(ancestor_id, desc_id, depth, path) AS (
          SELECT id, id, 1, ARRAY[id]
          FROM item_meta
          WHERE parent_id IS NULL
          UNION ALL
          SELECT td.ancestor_id, im.id, td.depth + 1, td.path || im.id
          FROM tree_descendants td
          JOIN item_meta im ON im.parent_id = td.desc_id
          WHERE NOT (im.id = ANY(td.path)) AND td.depth < 100
        )
        SELECT COALESCE(ROUND(SUM(im.contract_value), 2)::text, '0.00') AS project_total
        FROM tree_descendants td
        JOIN item_meta im ON im.id = td.desc_id;
        `,
        [projectId]
      );
      projectTotal = rootTotals.rows[0]?.project_total || "0.00";
    }

    const items = rows.map((r) => {
      const item = {
        id: r.id,
        parent_id: r.parent_id,
        code: r.code,
        name: r.name,
        is_leaf: r.is_leaf,
        quantity: r.quantity,
        unit: r.unit,
      };

      if (canViewPrices) {
        item.unit_price = r.unit_price;
        item.contract_value = r.contract_value;
        item.contract_total = r.contract_total;
      }

      return item;
    });

    const response = {
      project_id: projectId,
      can_view_prices: canViewPrices,
      units: VALID_CONTRACT_UNITS,
      items,
    };

    if (canViewPrices) {
      response.project_total = projectTotal;
    }

    return res.json(response);
  })
);

// ─── PUT /api/projects/:projectId/work-items/:workItemId/contract-quantity ───
/**
 * @swagger
 * /api/projects/{projectId}/work-items/{workItemId}/contract-quantity:
 *   put:
 *     summary: Cập nhật khối lượng, đơn vị và đơn giá hợp đồng cho hạng mục lá
 *     tags: [ContractQuantity]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: workItemId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity, unit, unit_price]
 *             properties:
 *               quantity:
 *                 type: string
 *               unit:
 *                 type: string
 *               unit_price:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy hạng mục
 *       422:
 *         description: Hạng mục cha không thể khai khối lượng
 */
router.put(
  "/:projectId/work-items/:workItemId/contract-quantity",
  requireAuth,
  checkProjectAccess,
  allow(PERMISSIONS.MUTATE),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const workItemId = parsePositiveInt(req.params.workItemId);

    if (!projectId || !workItemId) {
      return res.status(400).json({
        message: "projectId hoặc workItemId không hợp lệ",
      });
    }

    const errors = {};

    // Validate quantity
    const quantityResult = parseDecimalInput(req.body.quantity, {
      maxIntDigits: 11,
      maxScale: 3,
      fieldName: "Khối lượng",
    });
    if (!quantityResult.valid) {
      errors.quantity = quantityResult.error;
    }

    // Validate unit
    let normalizedUnit = null;
    if (req.body.unit === undefined || req.body.unit === null || req.body.unit === "") {
      errors.unit = "Đơn vị tính là bắt buộc";
    } else {
      normalizedUnit = normalizeContractUnit(req.body.unit);
      if (!normalizedUnit) {
        errors.unit = `Đơn vị tính không hợp lệ. Danh sách hợp lệ: ${VALID_CONTRACT_UNITS.join(", ")}`;
      }
    }

    // Validate unit_price
    const priceResult = parseDecimalInput(req.body.unit_price, {
      maxIntDigits: 14,
      maxScale: 2,
      fieldName: "Đơn giá",
    });
    if (!priceResult.valid) {
      errors.unit_price = priceResult.error;
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: "Dữ liệu đầu vào không hợp lệ",
        errors,
      });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Khóa dòng hạng mục để kiểm tra và cập nhật an toàn
      const existingRes = await client.query(
        `SELECT id, quantity::text, unit, unit_price::text, contract_value::text
         FROM work_items
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [workItemId, projectId]
      );

      if (existingRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      const beforeItem = existingRes.rows[0];

      // Kiểm tra xem hạng mục có con (work_item) hay không
      const childCheck = await client.query(
        `SELECT COUNT(*)::int AS child_count
         FROM work_items
         WHERE parent_id = $1`,
        [workItemId]
      );

      const childCount = childCheck.rows[0].child_count;
      if (childCount > 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          message:
            `Hạng mục cha không khai khối lượng hợp đồng trực tiếp; ` +
            `hãy khai ở các hạng mục lá bên dưới (hiện có ${childCount} hạng mục con).`,
        });
      }

      // Cập nhật giá trị
      const updateRes = await client.query(
        `UPDATE work_items
         SET quantity = $1,
             unit = $2,
             unit_price = $3,
             updated_at = NOW()
         WHERE id = $4 AND project_id = $5
         RETURNING id, quantity::text, unit, unit_price::text, contract_value::text`,
        [
          quantityResult.value,
          normalizedUnit,
          priceResult.value,
          workItemId,
          projectId,
        ]
      );

      const afterItem = updateRes.rows[0];

      // Ghi nhật ký audit_logs ngay trong giao dịch
      const userId = req.user ? req.user.id : null;
      const ipAddress = req.ip || req.connection?.remoteAddress || null;

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          "CONTRACT_QUANTITY_SET",
          "work_items",
          workItemId,
          JSON.stringify({
            project_id: projectId,
            before: {
              quantity: beforeItem.quantity,
              unit: beforeItem.unit,
              unit_price: beforeItem.unit_price,
            },
            after: {
              quantity: afterItem.quantity,
              unit: afterItem.unit,
              unit_price: afterItem.unit_price,
            },
          }),
          ipAddress,
        ]
      );

      await client.query("COMMIT");

      return res.json({
        id: afterItem.id,
        quantity: afterItem.quantity,
        unit: afterItem.unit,
        unit_price: afterItem.unit_price,
        contract_value: afterItem.contract_value,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── DELETE /api/projects/:projectId/work-items/:workItemId/contract-quantity 
/**
 * @swagger
 * /api/projects/{projectId}/work-items/{workItemId}/contract-quantity:
 *   delete:
 *     summary: Xoá khối lượng hợp đồng (đưa về NULL) của hạng mục
 *     tags: [ContractQuantity]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: workItemId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xoá thành công (idempotent)
 *       400:
 *         description: Tham số không hợp lệ
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy hạng mục
 */
router.delete(
  "/:projectId/work-items/:workItemId/contract-quantity",
  requireAuth,
  checkProjectAccess,
  allow(PERMISSIONS.MUTATE),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const workItemId = parsePositiveInt(req.params.workItemId);

    if (!projectId || !workItemId) {
      return res.status(400).json({
        message: "projectId hoặc workItemId không hợp lệ",
      });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const existingRes = await client.query(
        `SELECT id, quantity::text, unit, unit_price::text, contract_value::text
         FROM work_items
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [workItemId, projectId]
      );

      if (existingRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      const beforeItem = existingRes.rows[0];

      await client.query(
        `UPDATE work_items
         SET quantity = NULL,
             unit = NULL,
             unit_price = NULL,
             updated_at = NOW()
         WHERE id = $1 AND project_id = $2`,
        [workItemId, projectId]
      );

      // Ghi nhật ký audit_logs ngay trong giao dịch
      const userId = req.user ? req.user.id : null;
      const ipAddress = req.ip || req.connection?.remoteAddress || null;

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          "CONTRACT_QUANTITY_CLEAR",
          "work_items",
          workItemId,
          JSON.stringify({
            project_id: projectId,
            before: {
              quantity: beforeItem.quantity,
              unit: beforeItem.unit,
              unit_price: beforeItem.unit_price,
            },
            after: {
              quantity: null,
              unit: null,
              unit_price: null,
            },
          }),
          ipAddress,
        ]
      );

      await client.query("COMMIT");

      return res.json({
        id: workItemId,
        quantity: null,
        unit: null,
        unit_price: null,
        contract_value: null,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
