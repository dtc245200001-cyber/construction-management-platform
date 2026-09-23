// Test tích hợp cho T-08.
//
// Cần một PostgreSQL thật đang chạy (vd. `docker compose up -d postgres`)
// và biến môi trường DATABASE_URL trỏ tới nó (xem .env.example). Test chạy
// migration T-08 thật (bằng `node-pg-migrate`) lên một schema tạm, kiểm tra
// migration tiến/lùi sạch, index trên parent_id tồn tại, và truy vấn đệ quy
// lấy cây con trả về đúng dữ liệu.

const { execFileSync } = require("child_process");
const path = require("path");
const { Pool } = require("pg");
const { getWorkItemSubtree, getDescendantIds } = require("../queries/workItemTree");

// npm test không tự load .env như app.js (app.js tự gọi dotenv.config()),
// nên test đứng riêng phải tự nạp để có DATABASE_URL khi chạy `npm test`
// trực tiếp ở máy dev. Trên CI, DATABASE_URL đã được set sẵn ở env nên
// dotenv sẽ không ghi đè giá trị đó (mặc định dotenv không override biến
// đã tồn tại).
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const backendDir = path.join(__dirname, "..");

function runMigration(direction) {
  execFileSync("npx", ["node-pg-migrate", direction, "-m", "migrations"], {
    cwd: backendDir,
    env: process.env,
    stdio: "inherit",
    // Trên Windows, npx là file .cmd chứ không phải .exe — execFileSync
    // cần shell: true thì mới tìm và chạy được nó (trên macOS/Linux vẫn
    // hoạt động bình thường với shell: true).
    shell: true,
  });
}

describe("T-08: bảng projects/work_items dạng cây", () => {
  let pool;
  let projectId;
  // Cây test:
  //   root
  //   ├── child1
  //   │   ├── grandchild1
  //   │   └── grandchild2
  //   └── child2
  let ids = {};

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL chưa được set. Chạy `docker compose up -d postgres` " +
          "và copy .env.example thành .env trước khi chạy test này."
      );
    }

    // Migration tiến: phải chạy sạch, không lỗi.
    runMigration("up");

    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const projectRes = await pool.query(
      "INSERT INTO projects (name, location) VALUES ($1, $2) RETURNING id",
      ["Dự án test T-08", "Thái Nguyên"]
    );
    projectId = projectRes.rows[0].id;

    async function insertWorkItem(name, parentId) {
      const res = await pool.query(
        `INSERT INTO work_items (project_id, parent_id, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [projectId, parentId, name]
      );
      return res.rows[0].id;
    }

    ids.root = await insertWorkItem("root", null);
    ids.child1 = await insertWorkItem("child1", ids.root);
    ids.child2 = await insertWorkItem("child2", ids.root);
    ids.grandchild1 = await insertWorkItem("grandchild1", ids.child1);
    ids.grandchild2 = await insertWorkItem("grandchild2", ids.child1);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
      await pool.end();
    }
    // Migration lùi: phải chạy sạch, không lỗi, và dọn hết bảng đã tạo.
    runMigration("down");
  });

  it("có index trên cột work_items.parent_id", async () => {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'work_items' AND indexdef ILIKE '%parent_id%'`
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("lấy đúng cây con (gồm chính nó) của một hạng mục ở giữa cây", async () => {
    const subtree = await getWorkItemSubtree(pool, ids.child1);
    const names = subtree.map((row) => row.name).sort();

    expect(names).toEqual(["child1", "grandchild1", "grandchild2"]);
    // Không được lẫn root hay child2 (không phải hậu duệ của child1).
    expect(names).not.toContain("root");
    expect(names).not.toContain("child2");
  });

  it("includeRoot: false thì chỉ trả về hậu duệ, không gồm chính hạng mục gốc", async () => {
    const descendantIds = await getDescendantIds(pool, ids.child1);
    expect(descendantIds.sort()).toEqual([ids.grandchild1, ids.grandchild2].sort());
    expect(descendantIds).not.toContain(ids.child1);
  });

  it("hạng mục lá (không có con) thì cây con chỉ có chính nó", async () => {
    const subtree = await getWorkItemSubtree(pool, ids.grandchild1);
    expect(subtree.map((row) => row.id)).toEqual([ids.grandchild1]);
  });

  it("lấy từ gốc thì trả về toàn bộ cây, sắp theo độ sâu", async () => {
    const subtree = await getWorkItemSubtree(pool, ids.root);
    expect(subtree).toHaveLength(5);
    expect(subtree[0].id).toBe(ids.root);
    expect(subtree[0].depth).toBe(0);
    expect(subtree.every((row) => row.depth <= 2)).toBe(true);
  });
});
