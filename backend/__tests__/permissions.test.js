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
      expect(can(ROLES.KY_SU_GIAM_SAT, "acceptance.return_official")).toBe(false);
    });
    test("kỹ sư giám sát, chủ đầu tư, ban quản lý truy cập nghiệm thu; ban quản lý và chủ đầu tư duyệt/trả lại", () => {
      expect(can(ROLES.KY_SU_GIAM_SAT, "acceptance.access")).toBe(true);
      expect(can(ROLES.CHU_DAU_TU, "acceptance.access")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "acceptance.access")).toBe(true);

      // BQL không tạo hồ sơ, nhưng duyệt và trả lại được phiếu nghiệm thu (S-38)
      expect(can(ROLES.BAN_QUAN_LY, "acceptance.create_dossier")).toBe(false);
      expect(can(ROLES.BAN_QUAN_LY, "acceptance.approve_official")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "acceptance.return_official")).toBe(true);

      for (const role of [
        ROLES.CHI_HUY_TRUONG,
        ROLES.DOI_TRUONG,
        ROLES.KE_TOAN,
      ]) {
        expect(can(role, "acceptance.access")).toBe(false);
        expect(can(role, "acceptance.create_dossier")).toBe(false);
        expect(can(role, "acceptance.approve_official")).toBe(false);
        expect(can(role, "acceptance.return_official")).toBe(false);
      }
      expect(can(ROLES.CHU_DAU_TU, "acceptance.approve_official")).toBe(true);
      expect(can(ROLES.CHU_DAU_TU, "acceptance.return_official")).toBe(true);
    });
  });

  describe("chốt/mở khóa nhật ký (đã chuyển giao)", () => {
    test("ky_su_giam_sat chốt được nhật ký (site_log.close_daily)", () => {
      expect(can(ROLES.KY_SU_GIAM_SAT, "site_log.close_daily")).toBe(true);
    });
    test("ban_quan_ly mở khóa được nhật ký đã chốt (site_log.correct_locked)", () => {
      expect(can(ROLES.BAN_QUAN_LY, "site_log.correct_locked")).toBe(true);
    });
    test("chi_huy_truong KHÔNG chốt/mở được sau khi chuyển giao", () => {
      expect(can(ROLES.CHI_HUY_TRUONG, "site_log.close_daily")).toBe(false);
      expect(can(ROLES.CHI_HUY_TRUONG, "site_log.correct_locked")).toBe(false);
    });
    test("role không được giao không chốt/mở được", () => {
      expect(can(ROLES.CHI_HUY_TRUONG, "site_log.close_daily")).toBe(false);
      expect(can(ROLES.KY_SU_GIAM_SAT, "site_log.correct_locked")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "site_log.close_daily")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "site_log.correct_locked")).toBe(false);
    });
  });

  describe("member.manage chỉ Ban quản lý (CĐT chỉ giám sát)", () => {
    test("chỉ ban_quan_ly quản lý được thành viên", () => {
      expect(can(ROLES.BAN_QUAN_LY, "member.manage")).toBe(true);
    });
    test("chu_dau_tu KHÔNG quản lý thành viên", () => {
      expect(can(ROLES.CHU_DAU_TU, "member.manage")).toBe(false);
    });
    test("role khác không quản lý được thành viên", () => {
      expect(can(ROLES.CHI_HUY_TRUONG, "member.manage")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "member.manage")).toBe(false);
      expect(can(ROLES.KE_TOAN, "member.manage")).toBe(false);
      expect(can(ROLES.KY_SU_GIAM_SAT, "member.manage")).toBe(false);
      expect(can(ROLES.CHU_DAU_TU, "member.manage")).toBe(false);
    });
  });

  describe("quantity.report chỉ đội trưởng", () => {
    test("đúng doi_truong, các role khác không", () => {
      expect(can(ROLES.DOI_TRUONG, "quantity.report")).toBe(true);
      expect(can(ROLES.CHI_HUY_TRUONG, "quantity.report")).toBe(false);
      expect(can(ROLES.BAN_QUAN_LY, "quantity.report")).toBe(false);
    });
  });

  describe("S-40: phân quyền siêu dữ liệu ảnh và quyền riêng tư vị trí GPS", () => {
    test("mọi thành viên dự án (cả 6 role) đều được xem photo.view_metadata", () => {
      for (const role of Object.values(ROLES)) {
        expect(can(role, "photo.view_metadata")).toBe(true);
      }
    });

    test("chỉ chu_dau_tu và ban_quan_ly được xem toạ độ thô (photo.view_gps)", () => {
      expect(can(ROLES.CHU_DAU_TU, "photo.view_gps")).toBe(true);
      expect(can(ROLES.BAN_QUAN_LY, "photo.view_gps")).toBe(true);

      // Các vai trò khác không được xem toạ độ thô để bảo vệ vị trí người lao động
      expect(can(ROLES.KY_SU_GIAM_SAT, "photo.view_gps")).toBe(false);
      expect(can(ROLES.CHI_HUY_TRUONG, "photo.view_gps")).toBe(false);
      expect(can(ROLES.DOI_TRUONG, "photo.view_gps")).toBe(false);
      expect(can(ROLES.KE_TOAN, "photo.view_gps")).toBe(false);
    });
  });
});
