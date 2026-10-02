const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const requireSystemAdmin = require('../middleware/systemAdmin');
const { createAuditMiddleware } = require('../utils/auditLogger');
const { createEmailLog, processEmailLogs } = require('../lib/emailSender');
const emailTemplates = require('../lib/emailTemplates');

const router = express.Router();

router.use(requireSystemAdmin);

// POST /api/admin/invitations - System Admin invites a new user to the system
router.post('/invitations', createAuditMiddleware('CREATE_INVITATION', 'invitations'), async (req, res, next) => {
  const { email, projectId, role } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Vui lòng cung cấp email' });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    // Check if user already exists
    const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: 'Người dùng đã tồn tại trong hệ thống' });
    }

    // Check if valid invitation already exists
    const existInv = await client.query('SELECT id FROM invitations WHERE email = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP', [email]);
    if (existInv.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: 'Người dùng này đã được mời và thư mời vẫn còn hiệu lực' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    let invId;
    if (projectId && role) {
      const result = await client.query(
        `INSERT INTO invitations (email, token_hash, invited_by, expires_at, project_id, project_role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [email, tokenHash, req.user.id, expiresAt, projectId, role]
      );
      invId = result.rows[0].id;
    } else {
      const result = await client.query(
        `INSERT INTO invitations (email, token_hash, invited_by, expires_at) VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, tokenHash, req.user.id, expiresAt]
      );
      invId = result.rows[0].id;
    }

    // Ghi log E3
    await createEmailLog(client, invId, email);

    await client.query("COMMIT");

    // Xử lý gửi mail bất đồng bộ sau khi commit
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
    const emailData = projectId 
      ? emailTemplates.renderProjectInvite({ inviterName: 'Quản trị viên', projectName: 'Dự án (Admin tạo)', role, token, isNewUser: true, baseUrl })
      : emailTemplates.renderProjectInvite({ inviterName: 'Quản trị viên', projectName: 'Hệ thống CPM', role: 'Thành viên', token, isNewUser: true, baseUrl });

    processEmailLogs({
      id: invId,
      email,
      ...emailData
    }).catch(e => console.error("Error processing email outbox:", e));

    res.status(201).json({
      message: 'Đã tạo thư mời thành công'
      // Không trả token về client!
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/admin/users - Get all users (System Admin only)
router.get('/users', async (req, res, next) => {
  const client = await db.connect();
  try {
    const result = await client.query(
      `SELECT id, name, email, is_system_admin, is_verified, failed_login_attempts, locked_until, created_at 
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/admin/projects - Get all projects
router.get('/projects', async (req, res, next) => {
  const client = await db.connect();
  try {
    const result = await client.query(
      `SELECT p.id, p.name, p.code, p.status, p.created_at, 
              (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id) as member_count,
              (
                SELECT u.email 
                FROM project_members pm 
                JOIN users u ON pm.user_id = u.id 
                JOIN roles r ON pm.role_id = r.id
                WHERE pm.project_id = p.id AND r.name = 'ban_quan_ly' 
                LIMIT 1
              ) as pm_email
       FROM projects p
       ORDER BY p.created_at DESC`
    );
    res.json({ projects: result.rows });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/admin/projects - Create a project and assign PM
router.post('/projects', createAuditMiddleware('CREATE_PROJECT', 'projects'), async (req, res, next) => {
  const { name, code, pm_email } = req.body;
  if (!name || !code || !pm_email) {
    return res.status(400).json({ message: "Tên dự án, mã dự án và email PM là bắt buộc" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const exist = await client.query("SELECT id FROM projects WHERE code = $1", [code]);
    if (exist.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Mã dự án đã tồn tại" });
    }

    const projResult = await client.query(
      "INSERT INTO projects (name, code) VALUES ($1, $2) RETURNING id",
      [name, code]
    );
    const projectId = projResult.rows[0].id;

    const pmResult = await client.query("SELECT id FROM roles WHERE name = 'ban_quan_ly'");
    const pmRoleId = pmResult.rows[0].id;

    const userCheck = await client.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [pm_email]);
    
    if (userCheck.rows.length > 0) {
      await client.query(
        "INSERT INTO project_members (project_id, user_id, role_id) VALUES ($1, $2, $3)",
        [projectId, userCheck.rows[0].id, pmRoleId]
      );
    } else {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invRes = await client.query(
        "INSERT INTO invitations (email, project_id, project_role, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [pm_email, projectId, 'ban_quan_ly', tokenHash, expiresAt]
      );
      await createEmailLog(client, invRes.rows[0].id, pm_email);
      // Need to process later
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Đã tạo dự án và cấp quyền PM", projectId });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/admin/projects/:projectId/assign-pm - Fail-safe PM assignment
router.post('/projects/:projectId/assign-pm', createAuditMiddleware('ASSIGN_PM_FAILSAFE', 'projects'), async (req, res, next) => {
  const { projectId } = req.params;
  const { pm_email } = req.body;
  if (!pm_email) return res.status(400).json({ message: "Vui lòng cung cấp email PM mới" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const pmResult = await client.query("SELECT id FROM roles WHERE name = 'ban_quan_ly'");
    const pmRoleId = pmResult.rows[0].id;

    const userCheck = await client.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [pm_email]);
    if (userCheck.rows.length > 0) {
      const userId = userCheck.rows[0].id;
      
      const memberCheck = await client.query("SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
      if (memberCheck.rows.length > 0) {
        await client.query("UPDATE project_members SET role_id = $1 WHERE project_id = $2 AND user_id = $3", [pmRoleId, projectId, userId]);
      } else {
        await client.query("INSERT INTO project_members (project_id, user_id, role_id) VALUES ($1, $2, $3)", [projectId, userId, pmRoleId]);
      }
    } else {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invRes = await client.query(
        "INSERT INTO invitations (email, project_id, project_role, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [pm_email, projectId, 'ban_quan_ly', tokenHash, expiresAt]
      );
      await createEmailLog(client, invRes.rows[0].id, pm_email);
    }
    
    await client.query("COMMIT");
    res.json({ message: "Đã gán PM mới thành công" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});


// GET /api/admin/audit-logs - Get all audit logs
router.get('/audit-logs', async (req, res, next) => {
  const client = await db.connect();
  try {
    const result = await client.query(
      `SELECT al.id, al.action, al.entity, al.entity_id, al.details, al.ip_address, al.created_at, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 100`
    );
    res.json({ logs: result.rows });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/admin/users/:userId/lock - Lock a user account
router.post('/users/:userId/lock', createAuditMiddleware('LOCK_USER', 'users'), async (req, res, next) => {
  const { userId } = req.params;
  // Lock for 100 years basically
  const lockTime = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); 
  try {
    await db.query(
      'UPDATE users SET locked_until = $1 WHERE id = $2',
      [lockTime, userId]
    );
    res.json({ message: 'Đã khóa tài khoản thành công' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:userId/unlock - Unlock a user account
router.post('/users/:userId/unlock', createAuditMiddleware('UNLOCK_USER', 'users'), async (req, res, next) => {
  const { userId } = req.params;
  try {
    await db.query(
      'UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = $1',
      [userId]
    );
    res.json({ message: 'Đã mở khóa tài khoản thành công' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:userId/reset-password - Reset password for a user
router.post('/users/:userId/reset-password', createAuditMiddleware('RESET_PASSWORD', 'users'), async (req, res, next) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
  }

  try {
    const argon2 = require('argon2');
    const passwordHash = await argon2.hash(newPassword);

    await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );
    res.json({ message: 'Đã đặt lại mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
