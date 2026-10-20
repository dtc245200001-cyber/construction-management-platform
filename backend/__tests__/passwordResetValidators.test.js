const { validateResetPassword } = require("../utils/passwordResetValidators");

describe("passwordResetValidators", () => {
  it("từ chối mật khẩu ngắn hơn 8 ký tự", () => {
    expect(validateResetPassword("short", "short")).toBe(
      "Mật khẩu phải có ít nhất 8 ký tự"
    );
  });

  it("từ chối mật khẩu dài hơn 128 ký tự", () => {
    const long = "a".repeat(129);
    expect(validateResetPassword(long, long)).toBe(
      "Mật khẩu không được vượt quá 128 ký tự"
    );
  });

  it("từ chối khi xác nhận không khớp", () => {
    expect(validateResetPassword("Password123", "Password124")).toBe(
      "Mật khẩu xác nhận không khớp"
    );
  });

  it("chấp nhận mật khẩu hợp lệ", () => {
    expect(validateResetPassword("Password123", "Password123")).toBeNull();
  });
});
