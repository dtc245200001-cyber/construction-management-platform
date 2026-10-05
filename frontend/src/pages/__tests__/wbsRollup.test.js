import { describe, test, expect } from "vitest";
import { rollupCategoryDates } from "../WBSPage.jsx";

// Cây giống dữ liệu dự án "huong": hạng mục chứa công việc có ES/EF từ CPM
const task = (id, start, end) => ({
  id: `task-${id}`,
  type: "task",
  start_date: start,
  end_date: end,
  children: [],
});
const category = (id, children, extra = {}) => ({
  id,
  type: "category",
  start_date: null,
  end_date: null,
  children,
  ...extra,
});

describe("rollupCategoryDates (T-09: ngày hạng mục = min ES / max EF của con)", () => {
  test("hạng mục lấy ngày bắt đầu sớm nhất và kết thúc muộn nhất của các công việc con", () => {
    const tree = [
      category(1, [
        task(1, "2026-10-02", "2026-10-05"),
        task(2, "2026-10-05", "2026-10-10"),
        task(3, "2026-10-10", "2026-10-12"),
      ]),
    ];

    const [root] = rollupCategoryDates(tree);

    expect(root.start_date).toBe("2026-10-02");
    expect(root.end_date).toBe("2026-10-12");
  });

  test("lấy max EF chứ không phải EF của con cuối cùng (nhánh song song)", () => {
    // Xây tường kết thúc 27/10, Điện nước (con sau) kết thúc sớm hơn 26/10
    const tree = [
      category(2, [
        task(8, "2026-10-23", "2026-10-27"),
        task(9, "2026-10-24", "2026-10-26"),
      ]),
    ];

    const [root] = rollupCategoryDates(tree);

    expect(root.start_date).toBe("2026-10-23");
    expect(root.end_date).toBe("2026-10-27");
  });

  test("tổng hợp đệ quy qua nhiều cấp hạng mục", () => {
    const tree = [
      category(10, [
        category(11, [task(1, "2026-10-02", "2026-10-05")]),
        category(12, [
          category(13, [task(2, "2026-11-01", "2026-11-04")]),
        ]),
      ]),
    ];

    const [root] = rollupCategoryDates(tree);

    expect(root.start_date).toBe("2026-10-02");
    expect(root.end_date).toBe("2026-11-04");
    expect(root.children[1].start_date).toBe("2026-11-01");
    expect(root.children[1].children[0].end_date).toBe("2026-11-04");
  });

  test("hạng mục chưa có công việc nào được tính lịch thì để trống (null)", () => {
    const tree = [
      category(20, [], { start_date: "2020-01-01", end_date: "2020-12-31" }),
      category(21, [task(5, null, null)]),
    ];

    const [empty, unscheduled] = rollupCategoryDates(tree);

    expect(empty.start_date).toBeNull();
    expect(empty.end_date).toBeNull();
    expect(unscheduled.start_date).toBeNull();
    expect(unscheduled.end_date).toBeNull();
  });

  test("so sánh theo thời điểm thực, kể cả khi API trả về chuỗi ISO có giờ", () => {
    const tree = [
      category(30, [
        task(1, "2026-10-09T17:00:00.000Z", "2026-10-12T17:00:00.000Z"),
        task(2, "2026-10-01T17:00:00.000Z", "2026-10-04T17:00:00.000Z"),
      ]),
    ];

    const [root] = rollupCategoryDates(tree);

    expect(root.start_date).toBe("2026-10-01T17:00:00.000Z");
    expect(root.end_date).toBe("2026-10-12T17:00:00.000Z");
  });

  test("không làm thay đổi cây đầu vào", () => {
    const tree = [category(40, [task(1, "2026-10-02", "2026-10-05")])];

    rollupCategoryDates(tree);

    expect(tree[0].start_date).toBeNull();
  });
});
