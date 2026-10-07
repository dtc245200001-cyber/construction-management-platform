"use strict";

const request = require("supertest");
const app = require("../../app");
const db = require("../../config/db");
const { getTestToken } = require("../helpers/authHelper");
const { ROLES } = require("../../utils/constants");

describe("Milestones Integration Tests", () => {
  let projectManagerToken;
  let memberToken;
  let projectId;
  let workItemId;

  beforeAll(async () => {
    projectManagerToken = await getTestToken(ROLES.BAN_QUAN_LY);
    memberToken = await getTestToken(ROLES.KY_SU_GIAM_SAT);

    // Get a project id
    const projectRes = await db.query("SELECT id FROM projects LIMIT 1");
    projectId = projectRes.rows[0].id;

    // Create a work_item for the project
    const workItemRes = await db.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Test Work Item for Milestone') RETURNING id",
      [projectId]
    );
    workItemId = workItemRes.rows[0].id;
  });

  afterAll(async () => {
    await db.query("DELETE FROM work_items WHERE id = $1", [workItemId]);
  });

  it("should create a milestone successfully with BAN_QUAN_LY role", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Authorization", `Bearer ${projectManagerToken}`)
      .send({ required_date: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.work_item_id).toBe(workItemId);
  });

  it("should deny milestone creation with KY_SU_GIAM_SAT role", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ required_date: new Date().toISOString() });

    expect(res.status).toBe(403);
  });

  it("should enforce only one active milestone per work item", async () => {
    const date1 = new Date().toISOString();
    await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Authorization", `Bearer ${projectManagerToken}`)
      .send({ required_date: date1 });

    const date2 = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Authorization", `Bearer ${projectManagerToken}`)
      .send({ required_date: date2 });

    expect(res.status).toBe(201);
    
    // check db
    const activeRes = await db.query(
      "SELECT count(*) FROM milestones WHERE work_item_id = $1 AND is_active = true",
      [workItemId]
    );
    expect(parseInt(activeRes.rows[0].count)).toBe(1);

    const allRes = await db.query(
      "SELECT count(*) FROM milestones WHERE work_item_id = $1",
      [workItemId]
    );
    expect(parseInt(allRes.rows[0].count)).toBeGreaterThan(1);
  });

  it("should create a milestone successfully with CHU_DAU_TU role", async () => {
    const chuDauTuToken = await getTestToken(ROLES.CHU_DAU_TU);
    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Authorization", `Bearer ${chuDauTuToken}`)
      .send({ required_date: new Date().toISOString() });

    expect(res.status).toBe(201);
  });

  it("should return the active milestones in GET", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/milestones`)
      .set("Authorization", `Bearer ${projectManagerToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ms = res.body.find(m => m.work_item_id === workItemId);
    expect(ms).toBeDefined();
  });
});
