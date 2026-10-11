
require("dotenv").config();

const db = require("../config/db");
const argon2 = require("argon2");

const PROJECT_ID = 1;
const TEST_PASSWORD = "password123";

const ACCOUNTS = [
  {
    name: "Test Ban quan ly",
    email: "banquanly@cong-truong-360.vn",
    role: "ban_quan_ly",
  },
  {
    name: "Test Chi huy truong",
    email: "chihuytruong@cong-truong-360.vn",
    role: "chi_huy_truong",
  },
  {
    name: "Test Doi truong",
    email: "doitruong@cong-truong-360.vn",
    role: "doi_truong",
  },
  {
    name: "Test Ky su giam sat",
    email: "kysugiamsat@cong-truong-360.vn",
    role: "ky_su_giam_sat",
  },
  {
    name: "Test Chu dau tu",
    email: "chudautu@cong-truong-360.vn",
    role: "chu_dau_tu",
  },
  {
    name: "Test Ke toan",
    email: "ketoan@cong-truong-360.vn",
    role: "ke_toan",
  },
];

async function seedTestAccounts() {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Xac nhan dung du an ID 1, khong tao du an moi.
    const project = await client.query(
      "SELECT id FROM projects WHERE id = $1",
      [PROJECT_ID]
    );

    if (project.rowCount === 0) {
      throw new Error("Khong tim thay du an ID 1. Huy thao tac.");
    }

    // Them cac role con thieu; role da ton tai duoc giu nguyen.
    for (const account of ACCOUNTS) {
      await client.query(
        `INSERT INTO roles (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [account.role]
      );
    }

    const roleResult = await client.query(
      "SELECT id, name FROM roles WHERE name = ANY($1::text[])",
      [ACCOUNTS.map((account) => account.role)]
    );

    const roleIds = new Map(
      roleResult.rows.map((role) => [role.name, role.id])
    );

    for (const account of ACCOUNTS) {
      const roleId = roleIds.get(account.role);

      if (!roleId) {
        throw new Error(`Khong tim thay role: ${account.role}`);
      }

      const passwordHash = await argon2.hash(TEST_PASSWORD);

      // Chi tao/cap nhat tai khoan trong danh sach 6 email nay.
      const userResult = await client.query(
        `INSERT INTO users
           (name, email, password_hash, role_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role_id = EXCLUDED.role_id,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [account.name, account.email, passwordHash, roleId]
      );

      const userId = userResult.rows[0].id;

      // Gan vai tro thanh vien trong du an ID 1.
      const membership = await client.query(
        `UPDATE project_members
         SET role = $1
         WHERE project_id = $2 AND user_id = $3
         RETURNING id`,
        [account.role, PROJECT_ID, userId]
      );

      if (membership.rowCount === 0) {
        await client.query(
          `INSERT INTO project_members (project_id, user_id, role)
           SELECT $1, $2, $3
           WHERE NOT EXISTS (
             SELECT 1 FROM project_members
             WHERE project_id = $1 AND user_id = $2
           )`,
          [PROJECT_ID, userId, account.role]
        );
      }

      console.log(`Da cap nhat tai khoan: ${account.email}`);
    }

    await client.query("COMMIT");
    console.log("Hoan tat. Du lieu duoc gan vao du an ID 1.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Loi, da rollback giao dich:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end();
  }
}

seedTestAccounts().catch((error) => {
  console.error("Khong the chay seed:", error.message);
  process.exitCode = 1;
});
