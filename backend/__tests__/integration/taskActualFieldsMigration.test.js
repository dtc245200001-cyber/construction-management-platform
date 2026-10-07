"use strict";

const path = require("path");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");

describe("T-34: Migration thêm cột thực tế và ràng buộc bảng tasks", () => {
  let projectId;
  let workItemId;
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:postgres123@localhost:5432/construction_db_test";

  beforeAll(async () => {
    // Đảm bảo migration mới nhất đã được áp dụng
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      log: () => {},
    });

    // Dọn dẹp và tạo dữ liệu cha
    await pool.query(
      "TRUNCATE TABLE schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án T-34 Test', 'PRJ-T34', '2026-10-01')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    const wiRes = await pool.query(
      `INSERT INTO work_items (project_id, code, name, type)
       VALUES ($1, 'HM-T34', 'Hạng mục kiểm thử T-34', 'category')
       RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;
  });

  afterAll(async () => {
    // Đảm bảo sau khi test kết thúc, DB ở trạng thái migrated up
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      log: () => {},
    });
    await pool.end();
  });

  describe("1. Kiểm tra cấu trúc các cột mới trong bảng tasks", () => {
    it("Bảng tasks phải có ba cột: actual_start_date, actual_end_date, percent_complete", async () => {
      const { rows } = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'tasks'
          AND column_name IN ('actual_start_date', 'actual_end_date', 'percent_complete')
        ORDER BY column_name
      `);

      expect(rows).toHaveLength(3);

      const colMap = {};
      rows.forEach((r) => {
        colMap[r.column_name] = r;
      });

      // actual_start_date
      expect(colMap.actual_start_date).toBeDefined();
      expect(colMap.actual_start_date.data_type).toBe("date");
      expect(colMap.actual_start_date.is_nullable).toBe("YES");

      // actual_end_date
      expect(colMap.actual_end_date).toBeDefined();
      expect(colMap.actual_end_date.data_type).toBe("date");
      expect(colMap.actual_end_date.is_nullable).toBe("YES");

      // percent_complete
      expect(colMap.percent_complete).toBeDefined();
      expect(colMap.percent_complete.data_type).toBe("integer");
      expect(colMap.percent_complete.column_default).toContain("0");
    });
  });

  describe("2. Ràng buộc ngày kết thúc thực tế không được sớm hơn ngày bắt đầu", () => {
    it("Từ chối chèn khi actual_end_date sớm hơn actual_start_date (vi phạm ràng buộc)", async () => {
      let insertError;
      try {
        await pool.query(
          `INSERT INTO tasks (work_item_id, name, duration_days, actual_start_date, actual_end_date, percent_complete)
           VALUES ($1, 'Task ngày kết thúc lỗi', 3, '2026-10-10', '2026-10-05', 50)`,
          [workItemId]
        );
      } catch (err) {
        insertError = err;
      }

      expect(insertError).toBeDefined();
      expect(insertError.code).toBe("23514"); // PostgreSQL check_violation
      expect(insertError.constraint).toBe("tasks_actual_dates_order_check");
    });

    it("Chấp nhận khi actual_end_date bằng actual_start_date (cùng ngày kết thúc và bắt đầu)", async () => {
      const res = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days, actual_start_date, actual_end_date, percent_complete)
         VALUES ($1, 'Task cùng ngày', 1, '2026-10-10', '2026-10-10', 100)
         RETURNING *`,
        [workItemId]
      );

      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].percent_complete).toBe(100);
    });

    it("Chấp nhận khi actual_end_date muộn hơn actual_start_date", async () => {
      const res = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days, actual_start_date, actual_end_date, percent_complete)
         VALUES ($1, 'Task chuẩn ngày', 5, '2026-10-01', '2026-10-06', 80)
         RETURNING *`,
        [workItemId]
      );

      expect(res.rows).toHaveLength(1);
    });

    it("Chấp nhận khi actual_start_date có giá trị nhưng actual_end_date là NULL (đang làm)", async () => {
      const res = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days, actual_start_date, actual_end_date, percent_complete)
         VALUES ($1, 'Task đang làm', 4, '2026-10-01', NULL, 30)
         RETURNING *`,
        [workItemId]
      );

      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].actual_end_date).toBeNull();
    });
  });

  describe("3. Ràng buộc percent_complete trong khoảng 0 - 100", () => {
    it("Từ chối khi percent_complete < 0 (âm)", async () => {
      let insertError;
      try {
        await pool.query(
          `INSERT INTO tasks (work_item_id, name, duration_days, percent_complete)
           VALUES ($1, 'Task phần trăm âm', 2, -1)`,
          [workItemId]
        );
      } catch (err) {
        insertError = err;
      }

      expect(insertError).toBeDefined();
      expect(insertError.code).toBe("23514"); // PostgreSQL check_violation
      expect(insertError.constraint).toBe("tasks_percent_complete_range");
    });

    it("Từ chối khi percent_complete > 100 (vượt quá 100%)", async () => {
      let insertError;
      try {
        await pool.query(
          `INSERT INTO tasks (work_item_id, name, duration_days, percent_complete)
           VALUES ($1, 'Task vượt 100%', 2, 101)`,
          [workItemId]
        );
      } catch (err) {
        insertError = err;
      }

      expect(insertError).toBeDefined();
      expect(insertError.code).toBe("23514"); // PostgreSQL check_violation
      expect(insertError.constraint).toBe("tasks_percent_complete_range");
    });

    it("Chấp nhận các giá trị biên 0 và 100", async () => {
      const res0 = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days, percent_complete)
         VALUES ($1, 'Task 0%', 2, 0)
         RETURNING percent_complete`,
        [workItemId]
      );
      expect(res0.rows[0].percent_complete).toBe(0);

      const res100 = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days, percent_complete)
         VALUES ($1, 'Task 100%', 2, 100)
         RETURNING percent_complete`,
        [workItemId]
      );
      expect(res100.rows[0].percent_complete).toBe(100);
    });

    it("Mặc định percent_complete là 0 khi không truyền", async () => {
      const resDefault = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days)
         VALUES ($1, 'Task mặc định', 2)
         RETURNING percent_complete, actual_start_date, actual_end_date`,
        [workItemId]
      );
      expect(resDefault.rows[0].percent_complete).toBe(0);
      expect(resDefault.rows[0].actual_start_date).toBeNull();
      expect(resDefault.rows[0].actual_end_date).toBeNull();
    });
  });

  describe("4. Kiểm tra khả năng tiến và lùi của migration (Up & Down)", () => {
    it("Migration có thể rollback (down) 1 bước sạch sẽ", async () => {
      // Rollback migration T-34
      await runner({
        databaseUrl: dbUrl,
        dir: path.resolve(__dirname, "../../migrations"),
        direction: "down",
        migrationsTable: "pgmigrations",
        count: 1,
        log: () => {},
      });

      // Kiểm tra cột đã bị xóa khỏi bảng tasks
      const { rows } = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'tasks'
          AND column_name IN ('actual_start_date', 'actual_end_date', 'percent_complete')
      `);

      expect(rows).toHaveLength(0);
    });

    it("Migration có thể re-apply (up) lại sạch sẽ sau khi rollback", async () => {
      // Re-apply migration T-34
      await runner({
        databaseUrl: dbUrl,
        dir: path.resolve(__dirname, "../../migrations"),
        direction: "up",
        migrationsTable: "pgmigrations",
        count: 1,
        log: () => {},
      });

      // Kiểm tra các cột đã xuất hiện trở lại
      const { rows } = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'tasks'
          AND column_name IN ('actual_start_date', 'actual_end_date', 'percent_complete')
      `);

      expect(rows).toHaveLength(3);
    });
  });
});
