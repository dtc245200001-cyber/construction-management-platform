const { can, PERMISSIONS } = require("../utils/permissions");
const { ROLES } = require("../utils/constants");

describe("permissions matrix (phân quyền 6 vai trò)", () => {
  test("đủ 6 role hợp lệ trong ma trận", () => {
    const six = [
      "ban_quan_ly",
      "chi_huy_truong",
      "ky_su_giam_sat",
      "doi_truong",
      "chu_dau_tu",
      "ke_toan",
    ];
    expect(Object.values(ROLES).sort()).toEqual(six.sort());
  });

  test("unknown permission key luôn false", () => {
    expect(can("ban_quan_ly", "khong.ton_tai")).toBe(false);
  });

  describe("ràng buộc dễ sai #1: đội trưởng KHÔNG gán được việc", () => {
    test("doi_truong không có task.assign", () => {
      expect(can(ROLES.DOI_TRUONG, "task.assign")).toBe(false);
    });
    test("chỉ chi_huy_truong có task.assign", () => {
      expect(PERMISSIONS["task.assign"]).toEqual([ROLES.CHI_HUY_TRUONG]);
    });
    test("doi_truong không có bất kỳ acceptance.* nào", () => {
      const acceptanceKeys = Object.keys(PERMISSIONS).filter((k) =>
        k.startsWith("acceptance.")
      );
      expect(acceptanceKeys.length).toBeGreaterThan(0);
      for (const key of acceptanceKeys) {
        expect(can(ROLES.DOI_TRUONG, key)).toBe(false);
      }
    });
  });

  describe("ràng buộc dễ sai #2: giám sát tạo hồ sơ nhưng KHÔNG duyệt", () => {
    test("ky_su_giam_sat tạo/bổ sung được hồ sơ", () => {
      expect(can(ROLES.KY_SU_GIAM_SAT, "acceptance.create_dossier")).toBe(true);
      expect(can(ROLES.KY_SU_GIAM_SAT, "acceptance.update_dossier")).toBe(true);
    });
    test("ky_su_giam_sat KHÔNG duyệt nội bộ / chính thức", () => {
      expect(can(ROLES.KY_SU_GIAM_SAT, "acceptance.review_internal")).toBe(false);
      expect(can(ROLES.KY_SU_GIAM_SAT, "acceptance.approve_official")).toBe(false);
      expect(can(ROLES.KY_SU_GIAM_SAT, "acceptance.view_verified")).toBe(false);
    });
  });

  describe("chốt/mở khóa nhật ký thuộc Chỉ huy trưởng", () => {
    test("chi_huy_truong chốt + điều chỉnh được nhật ký đã chốt", () => {
      expect(can(ROLES.CHI_HUY_TRUONG, "site_log.close_daily")).toBe(true);
      expect(can(ROLES.CHI_HUY_TRUONG, "site_log.correct_locked")).toBe(true);
    });
    test("ky_su_giam_sat và ban_quan_ly KHÔNG chốt/mở được", () => {
      expect(can(ROLES.KY_SU_GIAM_SAT, "site_log.close_daily")).toBe(false);
      expect(can(ROLES.BAN_QUAN_LY, "site_log.close_daily")).toBe(false);
      expect(can(ROLES.KY_SU_GIAM_SAT, "site_log.correct_locked")).toBe(false);
      expect(can(ROLES.BAN_QUAN_LY, "site_log.correct_locked")).toBe(false);
    });
  });

  describe("member.manage giữ cả BQL + CĐT (quyết định giữ hành vi cũ)", () => {
    test("cả hai role đều quản lý được thành viên", () => {
      expect(can(ROLES.BAN_QUAN_LY, "member.manage")).toBe(true);
      expect(can(ROLES.CHU_DAU_TU, "member.manage")).toBe(true);
    });
    test("role khác không quản lý được thành viên", () => {
      expect(can(ROLES.CHI_HUY_TRUONG, "member.manage")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "member.manage")).toBe(false);
      expect(can(ROLES.KE_TOAN, "member.manage")).toBe(false);
      expect(can(ROLES.KY_SU_GIAM_SAT, "member.manage")).toBe(false);
    });
  });

  describe("quantity.report chỉ đội trưởng", () => {
    test("đúng doi_truong, các role khác không", () => {
      expect(can(ROLES.DOI_TRUONG, "quantity.report")).toBe(true);
      expect(can(ROLES.CHI_HUY_TRUONG, "quantity.report")).toBe(false);
      expect(can(ROLES.BAN_QUAN_LY, "quantity.report")).toBe(false);
    });
  });
});
