
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
        expect(item.alert_status).toBe("WARNING");
    });

    // TEST 5: Bộ dữ liệu mẫu tính tay đối chiếu trên cây đa cấp (T-122 & T-123)
    test("Đối chiếu bộ dữ liệu mẫu tính tay trên cây WBS đa cấp và tổng hợp cha con", async () => {
        // Tạo nhánh WBS cha và 4 con lá
        // Cha: PARENT-TREE (Hạng mục cha)
        const parentRes = await pool.query(
            `INSERT INTO work_items (project_id, name, code)
             VALUES ($1, 'Hạng mục tổng hợp cha K-T122', 'WBS-P1')
             RETURNING id`,
            [projectId]
        );
        const parentId = parentRes.rows[0].id;

        // Con 1: C1 (Dự toán 100M, HĐ 100m2, Thực chi 85M = 85%, Nghiệm thu 50m2 = 50% -> CẢNH BÁO)
        const c1Res = await pool.query(
            `INSERT INTO work_items (project_id, parent_id, name, code, quantity, unit, unit_price)
             VALUES ($1, $2, 'Công tác đào đất', 'WBS-C1', 100, 'm3', 1000000)
             RETURNING id`,
            [projectId, parentId]
        );
        const c1Id = c1Res.rows[0].id;

        // Con 2: C2 (Dự toán 50M, HĐ 200m2, Thực chi 45M = 90%, Nghiệm thu 180m2 = 90% -> ĐÃ HẾT CẢNH BÁO)
        const c2Res = await pool.query(
            `INSERT INTO work_items (project_id, parent_id, name, code, quantity, unit, unit_price)
             VALUES ($1, $2, 'Công tác bê tông móng', 'WBS-C2', 200, 'm3', 250000)
             RETURNING id`,
            [projectId, parentId]
        );
        const c2Id = c2Res.rows[0].id;

        // Con 3: C3 (Dự toán 30M, HĐ 50m2, Thực chi 15M = 50%, Nghiệm thu 10m2 = 20% -> BÌNH THƯỜNG)
        const c3Res = await pool.query(
            `INSERT INTO work_items (project_id, parent_id, name, code, quantity, unit, unit_price)
             VALUES ($1, $2, 'Công tác cốt thép', 'WBS-C3', 50, 'tan', 600000)
             RETURNING id`,
            [projectId, parentId]
        );
        const c3Id = c3Res.rows[0].id;

        // Con 4: C4 (CHƯA CÓ DỰ TOÁN, HĐ 80m2, Thực chi 10M, Nghiệm thu 0 -> KHÔNG CHIA CHO 0, KHÔNG CẢNH BÁO SAI)
        const c4Res = await pool.query(
            `INSERT INTO work_items (project_id, parent_id, name, code, quantity, unit, unit_price)
             VALUES ($1, $2, 'Công tác ván khuôn', 'WBS-C4', 80, 'm2', 125000)
             RETURNING id`,
            [projectId, parentId]
        );
        const c4Id = c4Res.rows[0].id;

        // Tạo phiên bản dự toán mới cho project
        const budgetRes = await request(app)
            .post(`/api/projects/${projectId}/budgets`)
            .set("Cookie", cookie)
            .send({
                description: "Dự toán đối chiếu tính tay T-122/T-123",
                items: [
                    { work_item_id: leafId, amount: 100000000 },
                    { work_item_id: c1Id, amount: 100000000 }, // 100M
                    { work_item_id: c2Id, amount: 50000000 },  // 50M
                    { work_item_id: c3Id, amount: 30000000 },  // 30M
                    // C4 không có dự toán (để trống)
                ],
            });
        expect(budgetRes.status).toBe(201);

        // Ghi nhận chi phí thực tế theo số liệu tính tay
        await pool.query(
            `INSERT INTO actual_costs (project_id, work_item_id, amount, description, expense_date, created_by)
             VALUES
             ($1, $2, 85000000, 'Chi phí C1', '2026-10-18', $6),
             ($1, $3, 45000000, 'Chi phí C2', '2026-10-18', $6),
             ($1, $4, 15000000, 'Chi phí C3', '2026-10-18', $6),
             ($1, $5, 10000000, 'Chi phí C4', '2026-10-18', $6)`,
            [projectId, c1Id, c2Id, c3Id, c4Id, userId]
        );

        // Ghi nhận nghiệm thu đã duyệt
        const voucher = await pool.query(
            `INSERT INTO acceptance_vouchers (project_id, batch_name, status, reviewed_at, created_by)
             VALUES ($1, 'Đợt nghiệm thu tính tay', 'approved', NOW(), $2)
             RETURNING id`,
            [projectId, userId]
        );
        const vId = voucher.rows[0].id;

        await pool.query(
            `INSERT INTO acceptance_voucher_items (voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity)
             VALUES
             ($1, $2, 50, 0, 50),   -- C1: 50 / 100 = 50% (< 80%)
             ($1, $3, 180, 0, 180), -- C2: 180 / 200 = 90% (>= 80%)
             ($1, $4, 10, 0, 10)    -- C3: 10 / 50 = 20% (< 80%)`,
            [vId, c1Id, c2Id, c3Id]
        );

        // Gọi API tổng hợp
        const summaryRes = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary`)
            .set("Cookie", cookie);

        expect(summaryRes.status).toBe(200);
        const items = summaryRes.body.items;

        const itemC1 = items.find((i) => Number(i.id) === Number(c1Id));
        const itemC2 = items.find((i) => Number(i.id) === Number(c2Id));
        const itemC3 = items.find((i) => Number(i.id) === Number(c3Id));
        const itemC4 = items.find((i) => Number(i.id) === Number(c4Id));
        const itemParent = items.find((i) => Number(i.id) === Number(parentId));

        // Kiểm tra C1: Chi phí 85% > 80%, Nghiệm thu 50% < 80% -> CẢNH BÁO
        expect(Number(itemC1.total_budget)).toBe(100000000);
        expect(Number(itemC1.total_actual_cost)).toBe(85000000);
        expect(Number(itemC1.utilization_percent)).toBe(85);
        expect(Number(itemC1.acceptance_percent)).toBe(50);
        expect(itemC1.has_alert).toBe(true);
        expect(itemC1.alert_status).toBe("WARNING");
        expect(itemC1.alert_code).toBe("ACTUAL_COST_OVER_80_AND_ACCEPTANCE_BELOW_80");

        // Kiểm tra C2: Chi phí 90% > 80%, Nghiệm thu 90% >= 80% -> ĐÃ HẾT CẢNH BÁO (RESOLVED)
        expect(Number(itemC2.total_budget)).toBe(50000000);
        expect(Number(itemC2.total_actual_cost)).toBe(45000000);
        expect(Number(itemC2.utilization_percent)).toBe(90);
        expect(Number(itemC2.acceptance_percent)).toBe(90);
        expect(itemC2.has_alert).toBe(false);
        expect(itemC2.alert_status).toBe("RESOLVED");
        expect(itemC2.alert_code).toBeNull();

        // Kiểm tra C3: Chi phí 50% <= 80% -> BÌNH THƯỜNG (NORMAL)
        expect(Number(itemC3.total_budget)).toBe(30000000);
        expect(Number(itemC3.total_actual_cost)).toBe(15000000);
        expect(Number(itemC3.utilization_percent)).toBe(50);
        expect(Number(itemC3.acceptance_percent)).toBe(20);
        expect(itemC3.has_alert).toBe(false);
        expect(itemC3.alert_status).toBe("NORMAL");

        // Kiểm tra C4: Chưa có dự toán -> không chia cho 0, không cảnh báo sai
        expect(itemC4.has_budget).toBe(false);
        expect(Number(itemC4.total_budget)).toBe(0);
        expect(Number(itemC4.total_actual_cost)).toBe(10000000);
        expect(itemC4.utilization_percent).toBeNull();
        expect(itemC4.has_alert).toBe(false);
        expect(itemC4.alert_status).toBe("NO_BUDGET");

        // Kiểm tra Hạng mục Cha: Tổng hợp đúng số liệu con
        // Dự toán cha = 100M + 50M + 30M + 0 = 180,000,000
        expect(Number(itemParent.total_budget)).toBe(180000000);
        // Thực chi cha = 85M + 45M + 15M + 10M = 155,000,000
        expect(Number(itemParent.total_actual_cost)).toBe(155000000);
        // Tỷ lệ = 155M / 180M * 100 = 86.11%
        expect(Number(itemParent.utilization_percent)).toBe(86.11);
        // Có con C1 bị cảnh báo -> cha phản ánh có cảnh báo
        expect(itemParent.has_alert).toBe(true);
        expect(itemParent.alert_count).toBe(1);
        expect(itemParent.alert_status).toBe("WARNING");

        // TEST 6: Trạng thái chuyển sang "đã hết cảnh báo" khi nghiệm thu bổ sung đạt >= 80%
        const voucher2 = await pool.query(
            `INSERT INTO acceptance_vouchers (project_id, batch_name, status, reviewed_at, created_by)
             VALUES ($1, 'Đợt nghiệm thu bổ sung C1', 'approved', NOW(), $2)
             RETURNING id`,
            [projectId, userId]
        );
        // Bổ sung nghiệm thu cho C1 từ 50 lên 85 (85%)
        await pool.query(
            `INSERT INTO acceptance_voucher_items (voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity)
             VALUES ($1, $2, 85, 50, 35)`,
            [voucher2.rows[0].id, c1Id]
        );

        const summaryAfterAcceptance = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary`)
            .set("Cookie", cookie);

        const updatedC1 = summaryAfterAcceptance.body.items.find(
            (i) => Number(i.id) === Number(c1Id)
        );
        const updatedParent = summaryAfterAcceptance.body.items.find(
            (i) => Number(i.id) === Number(parentId)
        );

        expect(Number(updatedC1.acceptance_percent)).toBe(85);
        expect(updatedC1.has_alert).toBe(false);
        expect(updatedC1.alert_status).toBe("RESOLVED");
        expect(updatedC1.alert_code).toBeNull();

        // Cha không còn con nào có cảnh báo
        expect(updatedParent.has_alert).toBe(false);
        expect(updatedParent.alert_count).toBe(0);
        expect(updatedParent.alert_status).toBe("RESOLVED");

        // TEST 7: Cấu hình ngưỡng cảnh báo qua query parameter (?threshold=95)
        const customThresholdRes = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary?threshold=95`)
            .set("Cookie", cookie);

        expect(customThresholdRes.status).toBe(200);
        expect(customThresholdRes.body.alert_threshold_percent).toBe(95);

        // TEST 8: Lọc đúng dự án (dự án khác không bị lẫn vào)
        const otherProjectRes = await pool.query(
            `INSERT INTO projects (name, code, start_date)
             VALUES ('Dự án khác', 'PRJ-OTHER-${suffix}', '2026-10-01')
             RETURNING id`
        );
        const otherProjectId = otherProjectRes.rows[0].id;

        const otherItemRes = await pool.query(
            `INSERT INTO work_items (project_id, name, code, quantity, unit, unit_price)
             VALUES ($1, 'Hạng mục dự án khác', 'OTH-01', 100, 'm', 500000)
             RETURNING id`,
            [otherProjectId]
        );

        const currentSummary = await request(app)
            .get(`/api/projects/${projectId}/budgets/summary`)
            .set("Cookie", cookie);

        const foundOther = currentSummary.body.items.some(
            (i) => Number(i.id) === Number(otherItemRes.rows[0].id)
        );
        expect(foundOther).toBe(false);

        // Dọn dẹp dự án khác
        await pool.query("DELETE FROM work_items WHERE project_id = $1", [otherProjectId]);
        await pool.query("DELETE FROM projects WHERE id = $1", [otherProjectId]);
    });
});
