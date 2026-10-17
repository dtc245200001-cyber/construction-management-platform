// utils/passwordResetValidators.js — Validate đầu vào cho luồng đặt lại mật khẩu.
//
// Reuse cùng chính sách với đăng ký hiện tại:
// - email: chuẩn hóa lowercase/trim, tối đa 255 ký tự, đúng định dạng.
// - mật khẩu: 8–128 ký tự, confirm phải khớp.

"use strict";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeResetEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 255) return null;
  if (!EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

function validateResetPassword(password, confirmPassword) {
  if (typeof password !== "string" || password.length < 8) {
    return "Mật khẩu phải có ít nhất 8 ký tự";
  }
  if (password.length > 128) {
    return "Mật khẩu không được vượt quá 128 ký tự";
  }
  if (password !== confirmPassword) {
    return "Mật khẩu xác nhận không khớp";
  }
  return null;
}

module.exports = { normalizeResetEmail, validateResetPassword };
