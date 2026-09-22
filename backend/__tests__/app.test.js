const request = require("supertest");
const app = require("../app");

describe("GET /", () => {
  it("trả về HTTP 200 và thông báo backend đang chạy", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Backend is running!");
  });
});
