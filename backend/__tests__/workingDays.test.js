"use strict";

const k01Data = require("./fixtures/k01-expected.json");
const {
  addWorkingDays,
  countWorkingDays,
  isWorkingDay,
  workingDayDiff,
  DEFAULT_CALENDAR,
} = require("../algorithms/workingDays");

describe("T-39: Module thuật toán ngày làm việc và ngày nghỉ", () => {
  const { metadata, defaultCalendar, cases } = k01Data.workingDaysTestCases;

  describe("Metadata & Khởi tạo", () => {
    it("Tệp dữ liệu T-22 có đủ metadata của T-39", () => {
      expect(metadata.source).toBe("T-39 / S-17");
      expect(metadata.calculatedBy).toBeDefined();
      expect(metadata.calculatedDate).toBeDefined();
      expect(cases).toHaveLength(6);
    });
  });

  describe("Bộ 6 ca tính tay độc lập (Acceptance Criteria)", () => {
    // Ca 1: Chạy qua Chủ nhật
    it("Ca 1: Cộng ngày và đếm ngày chạy qua Chủ nhật", () => {
      const c = cases.find((item) => item.id === "case1_cross_sunday");
      const addRes = addWorkingDays(c.startDate, c.n, defaultCalendar, c.holidays);
      expect(addRes).toBe(c.expectedAdd);

      const countRes = countWorkingDays(c.startDate, c.endDate, defaultCalendar, c.holidays);
      expect(countRes).toBe(c.expectedCount);
    });

    // Ca 2: Có ngày lễ ngày thường
    it("Ca 2: Có ngày nghỉ lễ rơi vào ngày làm việc trong tuần", () => {
      const c = cases.find((item) => item.id === "case2_holiday_on_weekday");
      const addRes = addWorkingDays(c.startDate, c.n, defaultCalendar, c.holidays);
      expect(addRes).toBe(c.expectedAdd);

      const countRes = countWorkingDays(c.startDate, c.endDate, defaultCalendar, c.holidays);
      expect(countRes).toBe(c.expectedCount);
    });

    // Ca 3: Lễ trùng Chủ nhật
    it("Ca 3: Ngày nghỉ lễ trùng vào ngày Chủ nhật (chỉ trừ 1 lần, không trừ 2 lần)", () => {
      const c = cases.find((item) => item.id === "case3_holiday_on_sunday");
      const addRes = addWorkingDays(c.addFrom, c.n, defaultCalendar, c.holidays);
      expect(addRes).toBe(c.expectedAdd);

      const countRes = countWorkingDays(c.startDate, c.endDate, defaultCalendar, c.holidays);
      expect(countRes).toBe(c.expectedCount);
    });

    // Ca 4: Cộng nhiều ngày qua nhiều tuần và ngày lễ
    it("Ca 4: Cộng nhiều ngày làm việc qua nhiều tuần và ngày lễ", () => {
      const c = cases.find((item) => item.id === "case4_multiple_weeks_and_holidays");
      const addRes = addWorkingDays(c.startDate, c.n, defaultCalendar, c.holidays);
      expect(addRes).toBe(c.expectedAdd);

      const countRes = countWorkingDays(c.startDate, c.endDate, defaultCalendar, c.holidays);
      expect(countRes).toBe(c.expectedCount);
    });

    // Ca 5: Đếm khoảng dài có cả Chủ nhật và nhiều ngày lễ
    it("Ca 5: Đếm số ngày làm việc khoảng dài có cả Chủ nhật và nhiều ngày lễ", () => {
      const c = cases.find((item) => item.id === "case5_long_range_with_holidays_and_sundays");
      const countRes = countWorkingDays(c.startDate, c.endDate, defaultCalendar, c.holidays);
      expect(countRes).toBe(c.expectedCount);
    });

    // Ca 6: Các trường hợp biên
    it("Ca 6: Các trường hợp biên (Start/End là Chủ nhật hoặc Lễ, n = 0)", () => {
      const c = cases.find((item) => item.id === "case6_edge_cases_start_end_holiday_sunday");
      const addRes = addWorkingDays(c.startDate, c.n, defaultCalendar, c.holidays);
      expect(addRes).toBe(c.expectedAdd);

      const countRes = countWorkingDays(c.startDate, c.endDate, defaultCalendar, c.holidays);
      expect(countRes).toBe(c.expectedCount);

      for (const edge of c.edgeCases) {
        if (edge.expectedCount !== undefined) {
          const res = countWorkingDays(edge.start, edge.end, defaultCalendar, c.holidays);
          expect(res).toBe(edge.expectedCount);
        }
        if (edge.expectedAdd !== undefined) {
          const res = addWorkingDays(edge.start, edge.n, defaultCalendar, c.holidays);
          expect(res).toBe(edge.expectedAdd);
        }
      }
    });
  });

  describe("AC Đặc biệt: Xử lý lễ trùng Chủ nhật và chứng minh lỗi nếu trừ lặp", () => {
    it("Khi lễ trùng Chủ nhật, số ngày làm việc không bị trừ hai lần", () => {
      // Tuần từ 2026-01-05 (T2) đến 2026-01-11 (CN): có 6 ngày làm việc (T2-T7), CN là ngày nghỉ.
      // Nếu đặt 2026-01-11 là holiday:
      const holidays = ["2026-01-11"];
      const correctDays = countWorkingDays("2026-01-05", "2026-01-11", DEFAULT_CALENDAR, holidays);
      expect(correctDays).toBe(6);

      // Hàm thuật toán sai mẫu: lấy (tổng ngày lịch) - (ngày nghỉ tuần) - (tổng số ngày lễ)
      // Nếu cài đặt sai trừ 2 lần: 7 ngày - 1 ngày CN - 1 ngày lễ = 5 ngày (SAI).
      const buggyCountWorkingDays = (start, end, cal, hList) => {
        const cur = new Date(start);
        const last = new Date(end);
        let totalDays = 0;
        let weekendDays = 0;
        while (cur <= last) {
          totalDays++;
          if (cur.getUTCDay() === 0) weekendDays++;
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        // Lỗi cố ý: trừ cả weekendDays lẫn holidays.length mà không kiểm tra trùng
        return totalDays - weekendDays - hList.length;
      };

      const buggyResult = buggyCountWorkingDays("2026-01-05", "2026-01-11", DEFAULT_CALENDAR, holidays);
      // Kết quả của thuật toán sai sẽ là 5 (sai so với đáp án đúng là 6)
      expect(buggyResult).toBe(5);
      expect(correctDays).not.toBe(buggyResult);
      expect(correctDays).toBe(6);
    });
  });

  describe("Tính thuần túy (Pure Function) & Khả năng tương thích", () => {
    it("Không làm thay đổi input objects/arrays", () => {
      const calendar = { ...DEFAULT_CALENDAR };
      const holidays = [{ holiday_date: "2026-01-07", name: "Lễ" }];
      const holidaysCopy = JSON.stringify(holidays);
      const calendarCopy = JSON.stringify(calendar);

      addWorkingDays("2026-01-05", 5, calendar, holidays);
      countWorkingDays("2026-01-01", "2026-01-15", calendar, holidays);

      expect(JSON.stringify(holidays)).toBe(holidaysCopy);
      expect(JSON.stringify(calendar)).toBe(calendarCopy);
    });

    it("Chấp nhận cả holidays dạng string lẫn object { holiday_date }", () => {
      const holidaysObj = [{ holiday_date: "2026-01-07" }];
      const holidaysStr = ["2026-01-07"];

      const res1 = addWorkingDays("2026-01-05", 3, DEFAULT_CALENDAR, holidaysObj);
      const res2 = addWorkingDays("2026-01-05", 3, DEFAULT_CALENDAR, holidaysStr);

      expect(res1).toBe(res2);
      expect(res1).toBe("2026-01-09");
    });

    it("Hỗ trợ lịch tùy chỉnh (Ví dụ: Tuần làm 5 ngày nghỉ T7 và CN)", () => {
      const fiveDayCal = {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      };

      // T6 09/01 + 1 ngày làm việc -> T2 12/01 (vì T7 và CN đều nghỉ)
      const res = addWorkingDays("2026-01-09", 1, fiveDayCal, []);
      expect(res).toBe("2026-01-12");

      const count = countWorkingDays("2026-01-05", "2026-01-11", fiveDayCal, []);
      expect(count).toBe(5); // T2 -> T6
    });

    it("Hỗ trợ lùi ngày khi n âm (n < 0)", () => {
      // T2 12/01 lùi 1 ngày làm việc -> T7 10/01 (bỏ qua CN 11/01)
      const res = addWorkingDays("2026-01-12", -1, DEFAULT_CALENDAR, []);
      expect(res).toBe("2026-01-10");
    });

    it("Đếm số ngày khi startDate > endDate trả về 0", () => {
      const count = countWorkingDays("2026-01-15", "2026-01-05", DEFAULT_CALENDAR, []);
      expect(count).toBe(0);
    });

    it("Hàm isWorkingDay trả về boolean chuẩn xác", () => {
      expect(isWorkingDay("2026-01-05", DEFAULT_CALENDAR, [])).toBe(true); // Monday
      expect(isWorkingDay("2026-01-11", DEFAULT_CALENDAR, [])).toBe(false); // Sunday
      expect(isWorkingDay("2026-01-05", DEFAULT_CALENDAR, ["2026-01-05"])).toBe(false); // Holiday
    });
  });

  describe("T-37: Hàm workingDayDiff", () => {
    it("Đúng kế hoạch (current == planned) => 0", () => {
      expect(workingDayDiff("2026-01-05", "2026-01-05")).toBe(0);
    });

    it("Sớm kế hoạch (current < planned) => Âm", () => {
      // planned: 10/01 (T7). current: 08/01 (T5). count(8, 9, 10) = 3 => diff = -2
      expect(workingDayDiff("2026-01-10", "2026-01-08")).toBe(-2);
    });

    it("Chậm kế hoạch (current > planned) => Dương", () => {
      // planned: 08/01 (T5). current: 10/01 (T7). count = 3 => diff = +2
      expect(workingDayDiff("2026-01-08", "2026-01-10")).toBe(2);
    });

    it("Vắt qua Chủ nhật", () => {
      // planned: 09/01 (T6). current: 12/01 (T2). count: 9(T6), 10(T7), 12(T2) = 3 ngày làm việc. diff = 2
      expect(workingDayDiff("2026-01-09", "2026-01-12")).toBe(2);
    });

    it("Có lễ ở giữa", () => {
      // planned: 09/01. current: 12/01. Holiday: 10/01. count: 9(T6), 12(T2) = 2 ngày. diff = 1
      expect(workingDayDiff("2026-01-09", "2026-01-12", DEFAULT_CALENDAR, ["2026-01-10"])).toBe(1);
    });

    it("Lễ trùng Chủ nhật (không trừ lặp)", () => {
      // planned: 09/01 (T6). current: 12/01 (T2). CN là 11/01. Holiday: 11/01.
      // count: 9(T6), 10(T7), 12(T2) = 3 ngày làm việc. diff = 2.
      expect(workingDayDiff("2026-01-09", "2026-01-12", DEFAULT_CALENDAR, ["2026-01-11"])).toBe(2);
    });
  });
});
