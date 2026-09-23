jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const db = require("../config/db");
const { checkProjectAccess, requireProjectRoles } = require('../middleware/projectAccess');

function createResponse() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("T-07 project access middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("route khong khai bao role phai tra 403", async () => {
    const req = {
      user: { id: 1 },
      params: { projectId: "1" },
      projectRole: "MEMBER"
    };

    const res = createResponse();
    const next = jest.fn();

    await requireProjectRoles()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("user khong tham gia project phai tra 403", async () => {
    const req = {
      user: { id: 10 },
      params: { projectId: "1" },
      projectRole: undefined
    };

    const res = createResponse();
    const next = jest.fn();

    await requireProjectRoles(["MEMBER"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("user co role hop le duoc phep truy cap", async () => {
    const req = {
      user: { id: 10 },
      params: { projectId: "1" },
      projectRole: "MEMBER"
    };

    const res = createResponse();
    const next = jest.fn();

    await requireProjectRoles(["MEMBER"])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("user thuoc project nhung sai role phai tra 403", async () => {
    const req = {
      user: { id: 10 },
      params: { projectId: "1" },
      projectRole: "MEMBER"
    };

    const res = createResponse();
    const next = jest.fn();

    await requireProjectRoles(["OWNER"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});