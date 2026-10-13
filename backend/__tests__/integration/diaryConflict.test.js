"use strict";

const { randomUUID } = require("crypto");
const request = require("supertest");
const argon2 = require("argon2");
const app = require("../../app");
const pool = require("../../config/db");

describe("S-32 diary version conflicts (T-76 to T-79)", () => {
  const password = "Password123!";
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let cookieA;
  let cookieB;
  let cookieNoPermission;
  let projectId;
  let workItemId;

  beforeAll(async () => {
    for (const role of ["ky_su_giam_sat", "ke_toan"]) {
      await pool.query(
        "INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [role],
      );
    }

    const { rows: roles } = await pool.query(
      "SELECT id, name FROM roles WHERE name = ANY($1::text[])",
      [["ky_su_giam_sat", "ke_toan"]],
    );
    const roleId = (name) => roles.find((role) => role.name === name).id;
    const passwordHash = await argon2.hash(password);

    const userA = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ($1, $2, $3, $4, false, true)
       RETURNING id`,
      ["S32 Engineer A", `s32_a_${suffix}@test.com`, passwordHash, roleId("ky_su_giam_sat")],
    );
    const userB = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ($1, $2, $3, $4, false, true)
       RETURNING id`,
      ["S32 Engineer B", `s32_b_${suffix}@test.com`, passwordHash, roleId("ky_su_giam_sat")],
    );
    const noPermissionUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ($1, $2, $3, $4, false, true)
       RETURNING id`,
      ["S32 Accountant", `s32_ketoan_${suffix}@test.com`, passwordHash, roleId("ke_toan")],
    );

    cookieA = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: `s32_a_${suffix}@test.com`, password })
    ).headers["set-cookie"];
    cookieB = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: `s32_b_${suffix}@test.com`, password })
    ).headers["set-cookie"];
    cookieNoPermission = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: `s32_ketoan_${suffix}@test.com`, password })
    ).headers["set-cookie"];

    const project = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ($1, $2, CURRENT_DATE)
       RETURNING id`,
      ["S32 Conflict Test", `S32_${suffix}`],
    );
    projectId = project.rows[0].id;

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ky_su_giam_sat'),
              ($1, $3, 'ky_su_giam_sat'),
              ($1, $4, 'ke_toan')`,
      [projectId, userA.rows[0].id, userB.rows[0].id, noPermissionUser.rows[0].id],
    );

    const workItem = await pool.query(
      `INSERT INTO work_items (project_id, name, code, type)
       VALUES ($1, $2, $3, 'category')
       RETURNING id`,
      [projectId, "S32 work item", `S32-WI-${suffix}`],
    );
    workItemId = workItem.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createEntry(content = "S32 initial content") {
    const response = await request(app)
      .post(`/api/projects/${projectId}/diary-entries`)
      .set("Cookie", cookieA)
      .send({
        work_item_id: workItemId,
        content,
        client_id: randomUUID(),
        entry_at: new Date(Date.now() - 60_000).toISOString(),
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.version).toBe(1);
    return response.body;
  }

  async function createConflict({
    serverContent = "SERVER_VERSION_2",
    clientContent = "CLIENT_STALE_VERSION_1",
  } = {}) {
    const entry = await createEntry();

    const update = await request(app)
      .put(`/api/projects/${projectId}/diary-entries/${entry.id}`)
      .set("Cookie", cookieA)
      .send({ content: serverContent, version: 1 });
    expect(update.status).toBe(200);
    expect(update.body.version).toBe(2);

    const conflict = await request(app)
      .put(`/api/projects/${projectId}/diary-entries/${entry.id}`)
      .set("Cookie", cookieB)
      .send({
        content: clientContent,
        version: 1,
        source: "offline_sync",
        client_updated_at: new Date().toISOString(),
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("DIARY_VERSION_CONFLICT");
    expect(conflict.body.conflict_id).toBeDefined();

    return { entryId: entry.id, conflictId: conflict.body.conflict_id };
  }

  it("T-76 updates with the matching version and increments version atomically", async () => {
    const entry = await createEntry("T76 v1");

    const response = await request(app)
      .put(`/api/projects/${projectId}/diary-entries/${entry.id}`)
      .set("Cookie", cookieA)
      .send({ content: "T76 v2", version: 1 });

    expect(response.status).toBe(200);
    expect(response.body.content).toBe("T76 v2");
    expect(response.body.version).toBe(2);
  });

  it("T-79 detects a true two-device race without losing either version", async () => {
    const entry = await createEntry("RACE_BASE_V1");

    const requestA = request(app)
      .put(`/api/projects/${projectId}/diary-entries/${entry.id}`)
      .set("Cookie", cookieA)
      .send({
        content: "RACE_DEVICE_A",
        version: 1,
        source: "offline_sync",
        client_updated_at: new Date().toISOString(),
      });
    const requestB = request(app)
      .put(`/api/projects/${projectId}/diary-entries/${entry.id}`)
      .set("Cookie", cookieB)
      .send({
        content: "RACE_DEVICE_B",
        version: 1,
        source: "offline_sync",
        client_updated_at: new Date().toISOString(),
      });

    const [responseA, responseB] = await Promise.all([requestA, requestB]);
    expect([responseA.status, responseB.status].sort()).toEqual([200, 409]);

    const winner = responseA.status === 200 ? responseA : responseB;
    const loser = responseA.status === 409 ? responseA : responseB;
    const winnerContent = responseA.status === 200 ? "RACE_DEVICE_A" : "RACE_DEVICE_B";
    const loserContent = responseA.status === 409 ? "RACE_DEVICE_A" : "RACE_DEVICE_B";
    expect(winner.body.version).toBe(2);
    expect(loser.body.code).toBe("DIARY_VERSION_CONFLICT");
    expect(loser.body.server_version).toBe(2);
    expect(loser.body.client_version).toBe(1);

    const { rows: entries } = await pool.query(
      "SELECT content, version FROM diary_entries WHERE id = $1",
      [entry.id],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe(2);
    expect(entries[0].content).toBe(winnerContent);

    const { rows: conflicts } = await pool.query(
      `SELECT status, server_version, client_version, server_snapshot, client_snapshot
       FROM diary_entry_conflicts
       WHERE id = $1`,
      [loser.body.conflict_id],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].status).toBe("pending");
    expect(conflicts[0].server_version).toBe(2);
    expect(conflicts[0].client_version).toBe(1);
    expect(conflicts[0].server_snapshot.content).toBe(winnerContent);
    expect(conflicts[0].client_snapshot.content).toBe(loserContent);
  });

  it("T-78 resolve server keeps the current version and records the resolution", async () => {
    const { entryId, conflictId } = await createConflict();

    const response = await request(app)
      .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
      .set("Cookie", cookieA)
      .send({ resolution: "server" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.resolution).toBe("server");
    expect(response.body.resulting_version).toBe(2);

    const { rows: entries } = await pool.query(
      "SELECT content, version FROM diary_entries WHERE id = $1",
      [entryId],
    );
    expect(entries[0].version).toBe(2);
    expect(entries[0].content).toBe("SERVER_VERSION_2");

    const { rows: conflicts } = await pool.query(
      "SELECT status, resolution, resolved_version FROM diary_entry_conflicts WHERE id = $1",
      [conflictId],
    );
    expect(conflicts[0]).toMatchObject({
      status: "resolved",
      resolution: "server",
      resolved_version: 2,
    });
  });

  it("T-78 resolve client applies the stored client snapshot and increments version", async () => {
    const { entryId, conflictId } = await createConflict({
      clientContent: "CLIENT_SELECTED_CONTENT",
    });

    const response = await request(app)
      .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
      .set("Cookie", cookieA)
      .send({ resolution: "client" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.resolution).toBe("client");
    expect(response.body.resulting_version).toBe(3);

    const { rows: entries } = await pool.query(
      "SELECT content, version FROM diary_entries WHERE id = $1",
      [entryId],
    );
    expect(entries[0].version).toBe(3);
    expect(entries[0].content).toBe("CLIENT_SELECTED_CONTENT");
  });

  it("T-78 refuses a stale client resolution after the server advances", async () => {
    const { entryId, conflictId } = await createConflict();

    const advance = await request(app)
      .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
      .set("Cookie", cookieA)
      .send({ content: "SERVER_VERSION_3", version: 2 });
    expect(advance.status).toBe(200);
    expect(advance.body.version).toBe(3);

    const response = await request(app)
      .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
      .set("Cookie", cookieA)
      .send({ resolution: "client" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("CONFLICT_STATE_CHANGED");

    const { rows } = await pool.query(
      "SELECT content, version FROM diary_entries WHERE id = $1",
      [entryId],
    );
    expect(rows[0].version).toBe(3);
    expect(rows[0].content).toBe("SERVER_VERSION_3");
  });

  it("T-78 rejects conflict resolution for a project member without write permission", async () => {
    const { conflictId } = await createConflict();

    const response = await request(app)
      .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
      .set("Cookie", cookieNoPermission)
      .send({ resolution: "server" });

    expect(response.status).toBe(403);

    const { rows } = await pool.query(
      "SELECT status FROM diary_entry_conflicts WHERE id = $1",
      [conflictId],
    );
    expect(rows[0].status).toBe("pending");
  });
});
