"use strict";

const fs = require("fs");
const path = require("path");
const { can, PERMISSIONS } = require("../utils/permissions");
const { ROLES } = require("../utils/constants");

// Đọc story_map.yaml
const storyMapPath = path.resolve(__dirname, "../../docs/permissions/story_map.yaml");
const storyMapContent = fs.readFileSync(storyMapPath, "utf-8");

// Parse các entry từ story_map.yaml
const entries = [];
let current = null;

for (const line of storyMapContent.split(/\r?\n/)) {
  const s = line.trim();
  if (s.startsWith("- story:")) {
    if (current && current.permission_key) {
      entries.push(current);
    }
    current = { story: s.replace("- story:", "").trim() };
  } else if (current) {
    if (s.startsWith("permission_key:")) {
      current.permission_key = s.replace("permission_key:", "").trim();
    } else if (s.startsWith("feature:")) {
      current.feature = s.replace("feature:", "").trim().replace(/^["']|["']$/g, "");
    } else if (s.startsWith("endpoint_status:")) {
      current.endpoint_status = s.replace("endpoint_status:", "").trim();
    } else if (s.startsWith("override:")) {
      current.override = s.replace("override:", "").trim();
    } else if (s.startsWith("allowed_roles:")) {
      const raw = s.replace("allowed_roles:", "").trim().replaceAll("[", "").replaceAll("]", "");
      current.allowed_roles = raw.split(",").map((r) => r.trim()).filter(Boolean);
    } else if (s.startsWith("denied_roles:")) {
      const raw = s.replace("denied_roles:", "").trim().replaceAll("[", "").replaceAll("]", "");
      current.denied_roles = raw.split(",").map((r) => r.trim()).filter(Boolean);
    }
  }
}
if (current && current.permission_key) {
  entries.push(current);
}

const PROJECT_ROLES = [
  ROLES.BAN_QUAN_LY,
  ROLES.CHI_HUY_TRUONG,
  ROLES.KY_SU_GIAM_SAT,
  ROLES.DOI_TRUONG,
  ROLES.CHU_DAU_TU,
  ROLES.KE_TOAN,
];

describe("Ma trận phân quyền SINH TỰ ĐỘNG từ story_map.yaml & matrix.yaml", () => {
  // Lọc các story đã implemented trong hệ thống
  const implementedEntries = entries.filter(
    (e) => e.endpoint_status !== "not_implemented"
  );

  test("Đã ánh xạ ít nhất 25 implemented story mappings", () => {
    expect(implementedEntries.length).toBeGreaterThanOrEqual(25);
  });

  // Sinh test case cho từng cặp (Story, Role)
  describe.each(implementedEntries)(
    "Story $story: $feature (key: $permission_key)",
    (entry) => {
      const { story, permission_key, allowed_roles, denied_roles, override } = entry;

      test.each(PROJECT_ROLES)(
        `Vai trò %s kiểm tra quyền ${permission_key}`,
        (role) => {
          const actualHasPermission = can(role, permission_key);

          if (allowed_roles.includes(role)) {
            expect(actualHasPermission).toBe(true);
          } else {
            expect(actualHasPermission).toBe(false);
          }
        }
      );

      test("Khách (khach) luôn bị từ chối (Default-Deny)", () => {
        expect(can(ROLES.KHACH, permission_key)).toBe(false);
      });
    }
  );

  // ── KIỂM TRA ĐẶC TẢ CÁC OVERRIDE ĐÃ CHỐT ──────────────────────────────────
  describe("Kiểm tra toàn diện các Override BL-1..BL-4 & OV-1..OV-3", () => {
    test("BL-1 (S-24): Khóa sổ = KSGS (site_log.close_daily), Mở khóa = BQL (site_log.correct_locked)", () => {
      expect(can(ROLES.KY_SU_GIAM_SAT, "site_log.close_daily")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "site_log.close_daily")).toBe(false);

      expect(can(ROLES.BAN_QUAN_LY, "site_log.correct_locked")).toBe(true);
      expect(can(ROLES.KY_SU_GIAM_SAT, "site_log.correct_locked")).toBe(false);
      expect(can(ROLES.CHI_HUY_TRUONG, "site_log.correct_locked")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "site_log.correct_locked")).toBe(false);
    });

    test("BL-2 (S-32): Key riêng xử lý xung đột nhật ký — KSGS chọn bản giữ, BQL chỉ xem", () => {
      expect(can(ROLES.KY_SU_GIAM_SAT, "diary.resolve_conflict")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "diary.resolve_conflict")).toBe(false);
      expect(can(ROLES.CHI_HUY_TRUONG, "diary.resolve_conflict")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "diary.resolve_conflict")).toBe(false);
      expect(can(ROLES.CHU_DAU_TU, "diary.resolve_conflict")).toBe(false);
      expect(can(ROLES.KE_TOAN, "diary.resolve_conflict")).toBe(false);
    });

    test("BL-3 (S-19): Đặt mốc bắt buộc cả CĐT và Ban quản lý", () => {
      expect(can(ROLES.CHU_DAU_TU, "milestone.manage")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "milestone.manage")).toBe(true);
      expect(can(ROLES.CHI_HUY_TRUONG, "milestone.manage")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "milestone.manage")).toBe(false);
    });

    test("BL-4 (S-47): cost.record chỉ Ban quản lý; Kế toán chỉ xem", () => {
      expect(can(ROLES.BAN_QUAN_LY, "cost.record")).toBe(true);
      expect(can(ROLES.KE_TOAN, "cost.record")).toBe(false);
      expect(can(ROLES.CHI_HUY_TRUONG, "cost.record")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "cost.record")).toBe(false);
      expect(can(ROLES.KY_SU_GIAM_SAT, "cost.record")).toBe(false);
      expect(can(ROLES.CHU_DAU_TU, "cost.record")).toBe(false);
    });

    test("OV-1: Đội trưởng bị chặn toàn bộ quyền tài chính", () => {
      const financeKeys = [
        "cost.record",
        "budget.view",
        "budget.manage",
        "payment_request.view",
        "payment_request.create",
        "payment.approve",
        "finance.report",
        "payment_retention.manage",
        "acceptance.export_dossier",
      ];
      for (const k of financeKeys) {
        expect(can(ROLES.DOI_TRUONG, k)).toBe(false);
      }
    });

    test("OV-3 / S-39: Chỉ loại Đội trưởng; CHT, KSGS, Kế toán, CĐT, BQL đều xem được audit.view_project", () => {
      expect(can(ROLES.CHU_DAU_TU, "audit.view_project")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "audit.view_project")).toBe(true);
      expect(can(ROLES.CHI_HUY_TRUONG, "audit.view_project")).toBe(true);
      expect(can(ROLES.KY_SU_GIAM_SAT, "audit.view_project")).toBe(true);
      expect(can(ROLES.KE_TOAN, "audit.view_project")).toBe(true);

      // Đội trưởng bị loại
      expect(can(ROLES.DOI_TRUONG, "audit.view_project")).toBe(false);
    });

    test("OQ-02 (S-38): Phê duyệt nghiệm thu chính thức thuộc Ban quản lý (CĐT duyệt thanh toán S-44)", () => {
      expect(can(ROLES.BAN_QUAN_LY, "acceptance.approve_official")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "acceptance.return_official")).toBe(true);
      expect(can(ROLES.CHU_DAU_TU, "acceptance.approve_official")).toBe(false);
      expect(can(ROLES.CHU_DAU_TU, "acceptance.return_official")).toBe(false);
      expect(can(ROLES.CHU_DAU_TU, "payment.approve")).toBe(true);
    });

    test("Khách (khach) bị Default-Deny trên 100% tất cả các key", () => {
      for (const k of Object.keys(PERMISSIONS)) {
        expect(can(ROLES.KHACH, k)).toBe(false);
      }
    });
  });
});
