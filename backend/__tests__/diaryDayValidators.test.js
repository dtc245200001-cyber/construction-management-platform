"use strict";

// S-22 / T-50 — Unit tests cho diaryDayValidators.js

const {
  isValidDate,
  validateDiaryDayBody,
  validateDateParam,
  validateDiaryDaysQuery,
} = require("../utils/diaryDayValidators");

describe("isValidDate", () => {
  it("chấp nhận ngày hợp lệ", () => {
    expect(isValidDate("2026-10-09")).toBe(true);
    expect(isValidDate("2026-01-31")).toBe(true);
  });

  it("từ chối ngày không tồn tại", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-04-31")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
  });

  it("năm nhuận 2028-02-29 hợp lệ, 2027-02-29 không hợp lệ", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2027-02-29")).toBe(false);
  });

  it("từ chối định dạng sai", () => {
    expect(isValidDate("10-09-2026")).toBe(false);
    expect(isValidDate("2026/10/09")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate("abc")).toBe(false);
  });
});

describe("validateDateParam", () => {
  it("trả rỗng khi ngày hợp lệ", () => {
    expect(validateDateParam("2026-10-09")).toEqual([]);
  });

  it("trả lỗi khi ngày không thật", () => {
    const errs = validateDateParam("2026-02-30");
    expect(errs.length).toBeGreaterThan(0);
  });

  it("trả lỗi khi sai định dạng", () => {
    const errs = validateDateParam("20261009");
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe("validateDiaryDayBody — manpower_count", () => {
  it("hợp lệ với 0", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: 0 });
    expect(errors).toEqual([]);
  });

  it("hợp lệ với 99999", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: 99999 });
    expect(errors).toEqual([]);
  });

  it("lỗi với -1", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: -1 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lỗi với 100000", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: 100000 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lỗi với chuỗi '5'", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: "5" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lỗi với chuỗi rỗng", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: "" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lỗi với NaN", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: NaN });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("lỗi với số thực 1.5", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("null được chấp nhận như vắng mặt", () => {
    const { errors } = validateDiaryDayBody({ manpower_count: null, weather_type_id: 1 });
    expect(errors).toEqual([]);
  });
});

describe("validateDiaryDayBody — weather_note", () => {
  it("500 ký tự hợp lệ", () => {
    const { errors } = validateDiaryDayBody({
      weather_note: "a".repeat(500),
      manpower_count: 5,
    });
    expect(errors).toEqual([]);
  });

  it("501 ký tự lỗi", () => {
    const { errors } = validateDiaryDayBody({
      weather_note: "a".repeat(501),
      manpower_count: 5,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("chuỗi toàn khoảng trắng coi là null (isEmpty)", () => {
    const { isEmpty } = validateDiaryDayBody({ weather_note: "   " });
    expect(isEmpty).toBe(true);
  });
});

describe("validateDiaryDayBody — equipment", () => {
  it("không phải mảng thì lỗi", () => {
    const { errors } = validateDiaryDayBody({
      equipment: "may_xuc",
      manpower_count: 5,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("trùng equipment_type_id thì lỗi", () => {
    const { errors } = validateDiaryDayBody({
      equipment: [
        { equipment_type_id: 1, quantity: 2 },
        { equipment_type_id: 1, quantity: 3 },
      ],
      manpower_count: 5,
    });
    expect(errors.some((e) => e.includes("trùng"))).toBe(true);
  });

  it("quantity = 0 thì lỗi", () => {
    const { errors } = validateDiaryDayBody({
      equipment: [{ equipment_type_id: 1, quantity: 0 }],
      manpower_count: 5,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("quantity âm thì lỗi", () => {
    const { errors } = validateDiaryDayBody({
      equipment: [{ equipment_type_id: 1, quantity: -1 }],
      manpower_count: 5,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("quantity 1.2 thì lỗi", () => {
    const { errors } = validateDiaryDayBody({
      equipment: [{ equipment_type_id: 1, quantity: 1.2 }],
      manpower_count: 5,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("quantity 10000 thì lỗi", () => {
    const { errors } = validateDiaryDayBody({
      equipment: [{ equipment_type_id: 1, quantity: 10000 }],
      manpower_count: 5,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("quá 50 phần tử thì lỗi", () => {
    const eq = Array.from({ length: 51 }, (_, i) => ({
      equipment_type_id: i + 1,
      quantity: 1,
    }));
    const { errors } = validateDiaryDayBody({ equipment: eq, manpower_count: 5 });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("validateDiaryDayBody — expected_updated_at", () => {
  it("ISO 8601 hợp lệ", () => {
    const { errors } = validateDiaryDayBody({
      manpower_count: 5,
      expected_updated_at: "2026-10-09T03:12:45.123Z",
    });
    expect(errors).toEqual([]);
  });

  it("chuỗi sai định dạng thì lỗi", () => {
    const { errors } = validateDiaryDayBody({
      manpower_count: 5,
      expected_updated_at: "not-a-date",
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("validateDiaryDayBody — body không phải object", () => {
  it("null thì lỗi", () => {
    const { errors } = validateDiaryDayBody(null);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("mảng thì lỗi", () => {
    const { errors } = validateDiaryDayBody([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("chuỗi thì lỗi", () => {
    const { errors } = validateDiaryDayBody("hello");
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("validateDiaryDayBody — isEmpty", () => {
  it("body trống hoàn toàn → isEmpty = true", () => {
    const { isEmpty } = validateDiaryDayBody({});
    expect(isEmpty).toBe(true);
  });

  it("chỉ có weather_note rỗng → isEmpty = true", () => {
    const { isEmpty } = validateDiaryDayBody({ weather_note: "   " });
    expect(isEmpty).toBe(true);
  });

  it("manpower_count = 0 → isEmpty = false (0 là nội dung hợp lệ)", () => {
    const { isEmpty } = validateDiaryDayBody({ manpower_count: 0 });
    expect(isEmpty).toBe(false);
  });
});

describe("validateDiaryDaysQuery", () => {
  it("thiếu from → lỗi", () => {
    const errs = validateDiaryDaysQuery({ to: "2026-10-11" });
    expect(errs.length).toBeGreaterThan(0);
  });

  it("thiếu to → lỗi", () => {
    const errs = validateDiaryDaysQuery({ from: "2026-10-05" });
    expect(errs.length).toBeGreaterThan(0);
  });

  it("from > to → lỗi", () => {
    const errs = validateDiaryDaysQuery({ from: "2026-10-11", to: "2026-10-05" });
    expect(errs.length).toBeGreaterThan(0);
  });

  it("khoảng > 62 ngày → lỗi", () => {
    const errs = validateDiaryDaysQuery({ from: "2026-01-01", to: "2026-03-10" });
    expect(errs.length).toBeGreaterThan(0);
  });

  it("7 ngày hợp lệ", () => {
    const errs = validateDiaryDaysQuery({ from: "2026-10-05", to: "2026-10-11" });
    expect(errs).toEqual([]);
  });
});
