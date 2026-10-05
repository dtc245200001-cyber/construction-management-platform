"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");

const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");

const { detectCycle } = require("../algorithms/cpm");
const { buildTempGraph, rotateCycleToStartWith } = require("../utils/buildTempGraph");
const { formatCycleSentence } = require("../utils/cycleMessage");

const {
  parsePositiveInt,
} = require("../utils/validators");

const {
  ROLES,
} = require("../utils/constants");

const asyncHandler = require("../utils/asyncHandler");

const router = createProjectRouter();

const VALID_TYPES = [
  "FS",
  "SS",
  "FF",
  "SF",
];

router.post(
  "/:projectId/dependencies",

  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),

  asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ message: "Body không hợp lệ" });
    }

    const projectId = parsePositiveInt(req.params.projectId);
    const predecessorId = parsePositiveInt(req.body.predecessor_id);
    const successorId = parsePositiveInt(req.body.successor_id);
    const dependencyType = String(req.body.dependency_type || "FS").toUpperCase();

    let leadLagDays = 0;
    if (req.body.lead_lag_days !== undefined && req.body.lead_lag_days !== null) {
      const val = req.body.lead_lag_days;
      if (typeof val === 'boolean' || Array.isArray(val) || val === '') {
        return res.status(400).json({ message: "lead_lag_days phải là số nguyên" });
      }
      const num = Number(val);
      if (!Number.isInteger(num)) {
        return res.status(400).json({ message: "lead_lag_days phải là số nguyên" });
      }
      if (num < -3650 || num > 3650) {
        return res.status(400).json({ message: "lead_lag_days phải nằm trong khoảng -3650 đến 3650" });
      }
      leadLagDays = num;
    }

    if (!projectId) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    if (!predecessorId || !successorId) {
      return res.status(400).json({
        message:
          "predecessor_id và successor_id phải hợp lệ",
      });
    }

    if (!VALID_TYPES.includes(dependencyType)) {
      return res.status(400).json({
        message:
          "dependency_type chỉ được là FS, SS, FF hoặc SF",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Khóa theo project để tránh 2 request đồng thời
      // cùng tạo ra vòng.
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [projectId]
      );

      // Lấy tất cả công việc của project.
      const itemsResult = await client.query(
        `SELECT t.id, t.name
         FROM tasks t
         JOIN work_items w ON w.id = t.work_item_id
         WHERE w.project_id = $1
         ORDER BY t.id`,
        [projectId]
      );

      const itemNames = new Map();

      for (const row of itemsResult.rows) {
        itemNames.set(
          Number(row.id),
          row.name
        );
      }

      if (
        !itemNames.has(predecessorId) ||
        !itemNames.has(successorId)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "Công việc không thuộc dự án này",
        });
      }

      // Chặn quan hệ trùng.
      const duplicate = await client.query(
        `SELECT 1
         FROM dependencies
         WHERE predecessor_id = $1
           AND successor_id = $2
         LIMIT 1`,
        [
          predecessorId,
          successorId,
        ]
      );

      if (duplicate.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Quan hệ công việc đã tồn tại",
        });
      }

      // Lấy các quan hệ hiện có trong đúng project.
      const depsResult = await client.query(
        `SELECT
           d.predecessor_id,
           d.successor_id
         FROM dependencies d
         JOIN tasks pre_t ON pre_t.id = d.predecessor_id
         JOIN work_items pre ON pre.id = pre_t.work_item_id
         JOIN tasks suc_t ON suc_t.id = d.successor_id
         JOIN work_items suc ON suc.id = suc_t.work_item_id
         WHERE pre.project_id = $1 AND suc.project_id = $1`,
        [projectId]
      );

      // Tự trỏ -> bắt sớm và trả 422
      if (predecessorId === successorId) {
        await client.query("ROLLBACK");
        const name = itemNames.get(predecessorId) || "(công việc không tên)";
        return res.status(422).json({
          code: "DEPENDENCY_CYCLE",
          message: "Không thể tự phụ thuộc vào chính mình",
          cycleIds: [predecessorId],
          cycleNames: [name],
          cyclePath: `${name} → ${name}`,
          cycleSentence: formatCycleSentence([name])
        });
      }

      // BƯỚC 1: Dựng đồ thị hiện tại (không có cạnh mới) để kiểm tra vòng lặp cũ
      const currentGraph = buildTempGraph(
        itemsResult.rows,
        depsResult.rows
      );

      let oldCycleIds = detectCycle(currentGraph);

      if (oldCycleIds && oldCycleIds.length > 0) {
        // Có vòng cũ trong DB
        // Xoay vòng lặp cũ để dễ nhìn (nếu có id nào trong mảng)
        oldCycleIds = rotateCycleToStartWith(oldCycleIds, oldCycleIds[0]);
        const oldNames = oldCycleIds.map(id => itemNames.get(Number(id)) || "(công việc không tên)");
        const sentence = formatCycleSentence(oldNames);
        
        // Thêm phần tử đầu vào cuối mảng names cho cyclePath (tương thích cũ)
        const oldPathNames = [...oldNames];
        oldPathNames.push(oldPathNames[0]);

        await client.query("ROLLBACK");
        return res.status(422).json({
          code: "EXISTING_CYCLE",
          message: "Dự án đang có sẵn vòng phụ thuộc từ dữ liệu cũ, cần sửa trước khi khai thêm quan hệ",
          cycleIds: oldCycleIds,
          cycleNames: oldNames,
          cyclePath: oldPathNames.join(" → "),
          cycleSentence: sentence
        });
      }

      // BƯỚC 2: Nếu không có vòng cũ, dựng đồ thị với cạnh mới
      const newGraph = buildTempGraph(
        itemsResult.rows,
        depsResult.rows,
        {
          predecessor_id: predecessorId,
          successor_id: successorId,
          dependency_type: dependencyType,
          lead_lag_days: leadLagDays
        }
      );

      let cycleIds = detectCycle(newGraph);

      if (cycleIds && cycleIds.length > 0) {
        // Xoay mảng để bắt đầu từ successorId (việc đang được khai)
        cycleIds = rotateCycleToStartWith(cycleIds, successorId);
        const names = cycleIds.map(id => itemNames.get(Number(id)) || "(công việc không tên)");
        const sentence = formatCycleSentence(names);

        // Thêm tên đầu vào cuối để đóng vòng
        const pathNames = [...names];
        pathNames.push(pathNames[0]);
        const pathStr = pathNames.join(" → ");

        await client.query("ROLLBACK");

        return res.status(422).json({
          code: "DEPENDENCY_CYCLE",
          message: sentence, // Trả message là sentence luôn hoặc tuỳ. Yêu cầu: "thêm field cycleSentence và dùng nó làm message của 422. Giữ nguyên cycleIds, cycleNames, cyclePath."
          cycleIds: cycleIds,
          cycleNames: names,
          cyclePath: pathStr,
          cycleSentence: sentence
        });
      }

      // Không có vòng -> mới được INSERT.
      const result = await client.query(
        `INSERT INTO dependencies (
           predecessor_id,
           successor_id,
           dependency_type,
           lead_lag_days
         )
         VALUES ($1, $2, $3, $4)

         RETURNING
           predecessor_id,
           successor_id,
           dependency_type,
           lead_lag_days`,
        [
          predecessorId,
          successorId,
          dependencyType,
          leadLagDays,
        ]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        message:
          "Tạo quan hệ công việc thành công",

        dependency:
          result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

module.exports = router;