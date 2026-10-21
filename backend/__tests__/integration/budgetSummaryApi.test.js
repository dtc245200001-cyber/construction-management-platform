
"use strict";

const request = require("supertest");
const argon2 = require("argon2");
const app = require("../../app");
const pool = require("../../config/db");

describe("T-122/T-123: API tổng hợp ngân sách và cảnh báo", () => {
    let cookie;
    let userId;
    let projectId;
    let leafId;

    const suffix = `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    const projectCode = `PRJ-S48-${suffix}`;

    beforeAll(async () => {
        // 1. Đảm bảo có role ban_quan_ly.
        await pool.query(
            `INSERT INTO roles (name)
             VALUES ('ban_quan_ly')
             ON CONFLICT (name) DO NOTHING`
        );

        const roleResult = await pool.query(
            `SELECT id FROM roles WHERE name = 'ban_quan_ly'`
        );

        if (!roleResult.rows.length) {
            throw new Error("Không tìm thấy role ban_quan_ly");
        }

        const roleId = roleResult.rows[0].id;
        const email = `budget_summary_${suffix}@test.com`;
        const password = "Password123!";
        const passwordHash = await argon2.hash(password);

        // 2. Tạo user kiểm thử.
        const userResult = await pool.query(
            `INSERT INTO users
             (name, email, password_hash, role_id,
              is_system_admin, is_verified)
             VALUES ($1, $2, $3, $4, false, true)
             RETURNING id`,
            ["Budget Summary Test", email, passwordHash, roleId]
        );

        userId = userResult.rows[0].id;

        // 3. Đăng nhập để lấy cookie.
        const loginResult = await request(app)
            .post("/api/auth/login")
            .send({ email, password });

        if (loginResult.status !== 200) {
            throw new Error(
                `Đăng nhập test thất bại: HTTP ${loginResult.status}`
            );
        }

        cookie = loginResult.headers["set-cookie"];

        // 4. Tạo dự án kiểm thử.
        const projectResult = await pool.query(
            `INSERT INTO projects (name, code, start_date)
             VALUES ($1, $2, $3)
             RETURNING id`,
            ["Budget Summary Test Project", projectCode, "2026-10-01"]
        );

        projectId = projectResult.rows[0].id;

        // 5. Cấp quyền thành viên dự án.
        await pool.query(
            `INSERT INTO project_members (project_id, user_id, role)
             VALUES ($1, $2, 'ban_quan_ly')`,
            [projectId, userId]
        );

        // 6. Tạo hạng mục lá với đủ thông tin hợp đồng.
        const itemResult = await pool.query(
            `INSERT INTO work_items
             (project_id, name, code, quantity, unit, unit_price)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
                projectId,
                "Budget Summary Test Item",
                "BS-01",
                100,
                "m2",
                1000000,
            ]
        );

        leafId = itemResult.rows[0].id;
    });

    afterAll(async () => {
        if (projectId) {
            // Xóa chi phí thực tế.
            await pool.query(
                "DELETE FROM actual_costs WHERE project_id = $1",
                [projectId]
            );

            // Xóa phiếu nghiệm thu trước khi xóa hạng mục.
            await pool.query(
                "DELETE FROM acceptance_vouchers WHERE project_id = $1",
                [projectId]
            );

            // Xóa ngân sách trước khi xóa hạng mục.
            await pool.query(
                "DELETE FROM budget_versions WHERE project_id = $1",
                [projectId]
            );

            await pool.query(
                "DELETE FROM work_items WHERE project_id = $1",
                [projectId]
            );

            await pool.query(
                "DELETE FROM project_members WHERE project_id = $1",
                [projectId]
            );

            await pool.query(
                "DELETE FROM projects WHERE id = $1",
                [projectId]
            );
        }

        if (userId) {
            await pool.query(
                "DELETE FROM users WHERE id = $1",
                [userId]
            );
        }
    });

    // TEST 1: Chưa đăng nhập phải trả về 401.
    test("Trả về 401 khi chưa đăng nhập", async () => {
        const response = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary`);

        expect(response.status).toBe(401);
    });

    // TEST 2: Chưa có ngân sách thì không có cảnh báo.
    test("Trả về WBS và không tạo cảnh báo khi chưa có ngân sách", async () => {
        const response = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary`)
            .set("Cookie", cookie);

        expect(response.status).toBe(200);
        expect(Number(response.body.project_id)).toBe(Number(projectId));
        expect(response.body.budget_version).toBeNull();
        expect(response.body.alert_threshold_percent).toBe(80);
        expect(Array.isArray(response.body.items)).toBe(true);

        const item = response.body.items.find(
            (entry) => Number(entry.id) === Number(leafId)
        );

        expect(item).toBeDefined();
        expect(item.has_budget).toBe(false);
        expect(item.has_alert).toBe(false);
        expect(item.alert_code).toBeNull();
        expect(Number(item.total_budget)).toBe(0);
    });

    // TEST 3: Tổng hợp ngân sách và chi phí thực tế.
    test("Tổng hợp ngân sách và chi phí thực tế sau khi tạo dự toán", async () => {
        const createBudget = await request(app)
            .post(`/api/projects/${projectId}/budgets`)
            .set("Cookie", cookie)
            .send({
                description: "Dự toán kiểm thử T-122/T-123",
                items: [
                    {
                        work_item_id: leafId,
                        amount: 100000000,
                        note: "Ngân sách kiểm thử",
                    },
                ],
            });

        expect(createBudget.status).toBe(201);

        // Ghi nhận 25 triệu chi phí thực tế.
        await pool.query(
            `INSERT INTO actual_costs
             (project_id, work_item_id, amount, description,
              expense_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                projectId,
                leafId,
                25000000,
                "Chi phí kiểm thử tổng hợp",
                "2026-10-15",
                userId,
            ]
        );

        const response = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary`)
            .set("Cookie", cookie);

        expect(response.status).toBe(200);
        expect(response.body.budget_version).toBe(1);
        expect(response.body.alert_threshold_percent).toBe(80);

        const item = response.body.items.find(
            (entry) => Number(entry.id) === Number(leafId)
        );

        expect(item).toBeDefined();
        expect(item.is_leaf).toBe(true);
        expect(item.has_budget).toBe(true);
        expect(Number(item.total_budget)).toBe(100000000);
        expect(Number(item.total_actual_cost)).toBe(25000000);
        expect(Number(item.utilization_percent)).toBe(25);
        expect(item.has_alert).toBe(false);
        expect(item.alert_code).toBeNull();
    });

    // TEST 4: Chi phí vượt 80%, nghiệm thu dưới 80%.
    test("Cảnh báo khi chi phí vượt 80% ngân sách nhưng nghiệm thu dưới 80%", async () => {
        // Đã có 25 triệu từ test trước; thêm 65 triệu = 90 triệu.
        await pool.query(
            `INSERT INTO actual_costs
             (project_id, work_item_id, amount, description,
              expense_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                projectId,
                leafId,
                65000000,
                "Alert threshold integration test",
                "2026-10-16",
                userId,
            ]
        );

        // Tạo phiếu nghiệm thu đã duyệt: khối lượng lũy kế 50/100.
        
        // Tạo phiếu nghiệm thu ở trạng thái draft.
        const voucherResult = await pool.query(
            `INSERT INTO acceptance_vouchers
             (project_id, batch_name, status, has_negative_delta, created_by)
             VALUES ($1, $2, 'draft', false, $3)
             RETURNING id`,
            [projectId, `Alert test ${suffix}`, userId]
        );

        // Thêm hạng mục khi phiếu vẫn đang ở trạng thái draft.
        await pool.query(
            `INSERT INTO acceptance_voucher_items
             (voucher_id, work_item_id, cumulative_quantity,
              prev_approved_cumulative, delta_quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [voucherResult.rows[0].id, leafId, 50, 0, 50]
        );

        // Chỉ duyệt phiếu sau khi đã thêm hạng mục.
        await pool.query(
            `UPDATE acceptance_vouchers
             SET status = 'approved'
             WHERE id = $1`,
            [voucherResult.rows[0].id]
        );

            

        const response = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary`)
            .set("Cookie", cookie);

        expect(response.status).toBe(200);

        const item = response.body.items.find(
            (entry) => Number(entry.id) === Number(leafId)
        );

        expect(item).toBeDefined();
        expect(Number(item.total_budget)).toBe(100000000);
        expect(Number(item.total_actual_cost)).toBe(90000000);
        expect(Number(item.utilization_percent)).toBe(90);
        expect(item.has_alert).toBe(true);
        expect(item.alert_code).toBeTruthy();
    });
});
