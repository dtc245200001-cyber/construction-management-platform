const { formatCycleSentence } = require("../utils/cycleMessage");

describe("formatCycleSentence", () => {
  test("Tự trỏ (1 việc)", () => {
    expect(formatCycleSentence(["A"])).toBe('Công việc "A" không thể chờ chính nó.');
  });

  test("Vòng 2 việc", () => {
    expect(formatCycleSentence(["A", "B"])).toBe('Công việc "A" chờ "B", "B" lại chờ "A".');
  });

  test("Vòng 3 việc", () => {
    expect(formatCycleSentence(["A", "B", "C"])).toBe('Công việc "A" chờ "B", "B" chờ "C", "C" lại chờ "A".');
  });

  test("Vòng 5 việc", () => {
    expect(formatCycleSentence(["A", "B", "C", "D", "E"])).toBe('Công việc "A" chờ "B", "B" chờ "C", "C" chờ "D", "D" chờ "E", "E" lại chờ "A".');
  });

  test("Tên có dấu tiếng Việt", () => {
    expect(formatCycleSentence(["Đổ móng", "Xây tường", "Lắp cửa"])).toBe('Công việc "Đổ móng" chờ "Xây tường", "Xây tường" chờ "Lắp cửa", "Lắp cửa" lại chờ "Đổ móng".');
  });

  test("Thiếu tên hoặc undefined -> (công việc không tên)", () => {
    expect(formatCycleSentence(["A", "", null])).toBe('Công việc "A" chờ "(công việc không tên)", "(công việc không tên)" chờ "(công việc không tên)", "(công việc không tên)" lại chờ "A".');
  });
  
  test("Tên là #id -> đổi thành (công việc không tên)", () => {
    expect(formatCycleSentence(["A", "#123"])).toBe('Công việc "A" chờ "(công việc không tên)", "(công việc không tên)" lại chờ "A".');
  });
});
