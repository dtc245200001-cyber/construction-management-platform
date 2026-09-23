require("dotenv").config();
const pool = require("../config/db");
const { getSubtree } = require("../queries/workItemTree");

// Test này chạy trên Postgres thật (không mock) vì WITH RECURSIVE cần được
// chính cơ sở dữ liệu thực thi để kiểm tra đúng. Cần migration đã chạy tới
// T-08 (bảng projects, work_items) trước khi chạy `npm test`.
// Cấu hình kết nối lấy từ .env (xem .env.example) hoặc biến môi trường CI.

describe("getSubtree - truy vấn đệ quy lấy cây con của một hạng mục", () => {
  let projectId;
  let root, child1, child2, grandchild1, unrelated;

  beforeAll(async () => {
    const projectResult = await pool.query(
      `INSERT INTO projects (name) VALUES ($1) RETURNING id`,
      ["Dự án test cây hạng mục"]
    );
    projectId = projectResult.rows[0].id;

    const insertWorkItem = async (name, parentId) => {
      const { rows } = await pool.query(
        `INSERT INTO work_items (project_id, parent_id, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [projectId, parentId, name]
      );
      return rows[0].id;
    };

    // Cây:
    // root
    // ├── child1
    // │   └── grandchild1
    // └── child2
    // unrelated: một hạng mục gốc khác trong cùng dự án, không thuộc cây trên
    root = await insertWorkItem("root", null);
    child1 = await insertWorkItem("child1", root);
    child2 = await insertWorkItem("child2", root);
    grandchild1 = await insertWorkItem("grandchild1", child1);
    unrelated = await insertWorkItem("unrelated", null);
  });

  afterAll(async () => {
    // Xoá project sẽ cascade xoá hết work_items liên quan (FK onDelete CASCADE)
    await pool.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
    await pool.end();
  });

  it("lấy cả cây con của hạng mục gốc, gồm chính nó, không lẫn nhánh khác", async () => {
    const rows = await getSubtree(pool, root);
    const ids = rows.map((r) => r.id).sort((a, b) => a - b);

    expect(ids).toEqual([root, child1, child2, grandchild1].sort((a, b) => a - b));
    expect(ids).not.toContain(unrelated);
  });

  it("lấy cây con của một hạng mục giữa cây thì chỉ gồm chính nó và hậu duệ", async () => {
    const rows = await getSubtree(pool, child1);
    const ids = rows.map((r) => r.id).sort((a, b) => a - b);

    expect(ids).toEqual([child1, grandchild1].sort((a, b) => a - b));
    expect(ids).not.toContain(child2);
    expect(ids).not.toContain(root);
  });

  it("hạng mục lá thì cây con chỉ có chính nó", async () => {
    const rows = await getSubtree(pool, grandchild1);
    expect(rows.map((r) => r.id)).toEqual([grandchild1]);
  });

  it("id không tồn tại thì trả về mảng rỗng", async () => {
    const rows = await getSubtree(pool, 0);
    expect(rows).toEqual([]);
  });
});
