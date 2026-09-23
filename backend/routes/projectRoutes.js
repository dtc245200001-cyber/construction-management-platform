const express = require("express");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const requireProjectRoles = require("../middleware/projectAccess");

const router = express.Router();

router.get(
  "/:projectId",
  requireAuth,
  requireProjectRoles(["OWNER", "MANAGER", "MEMBER"]),
  async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, name, location, start_date, created_at, updated_at
         FROM projects
         WHERE id = $1`,
        [req.params.projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Không tìm thấy dự án",
        });
      }

      return res.json({
        project: result.rows[0],
        membership: req.projectMember,
      });
    } catch (error) {
      console.error("GET PROJECT ERROR:", error);

      return res.status(500).json({
        message: "Lỗi máy chủ",
      });
    }
  }
);

router.get(
  "/:projectId/unconfigured",
  requireAuth,
  requireProjectRoles(),
  (req, res) => {
    return res.json({
      message: "Nếu nhìn thấy dòng này thì default deny đang sai",
    });
  }
);

module.exports = router;