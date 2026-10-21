"use strict";

const { runVerification } = require("../scripts/verify-permissions");

describe("CI Matrix & Permission Drift Verification", () => {
  test("Kiểm tra trôi matrix.yaml và conflict detection trong story_map.yaml", () => {
    expect(() => runVerification()).not.toThrow();
  });
});
