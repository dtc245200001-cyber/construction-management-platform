"use strict";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chuyển đổi input (string YYYY-MM-DD, ISO string, timestamp hoặc Date) thành Date đối tượng theo UTC (00:00:00).
 * @param {string|number|Date} dateInput
 * @returns {Date|null}
 */
function parseDateUTC(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(Date.UTC(year, month, day));
    }
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Định dạng Date object thành chuỗi YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
function formatDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Định dạng Date (UTC) thành chuỗi DD/MM/YYYY để hiển thị cho người dùng.
 * @param {Date} date
 * @returns {string}
 */
function formatDateVN(date) {
  const [y, m, d] = formatDateUTC(date).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Ngày kết thúc (tính bao gồm) khi biết ngày bắt đầu và số ngày thực hiện.
 * @returns {Date|null}
 */
function endFromDuration(start, durationDays) {
  const n = Number(durationDays);
  if (!start || !Number.isInteger(n) || n <= 0) return null;
  return new Date(start.getTime() + (n - 1) * ONE_DAY_MS);
}

/**
 * Xác định khoảng [start, end] (tính cả hai đầu) của một việc.
 * Hai đầu luôn lấy từ CÙNG một nguồn để không ghép lẫn dữ liệu, theo thứ tự:
 * 1. Thực tế: actual_start_date -> actual_end_date. Nếu đang thi công (chưa có
 *    actual_end_date) thì lấy ngày muộn nhất của early_finish và
 *    actual_start_date + duration_days - 1.
 * 2. Kế hoạch (CPM hoặc truyền trực tiếp): start_date/early_start ->
 *    end_date/early_finish; thiếu ngày kết thúc thì suy từ duration_days.
 * 3. Lịch thủ công: manual_start_date -> manual_start_date + duration_days - 1.
 *
 * @returns {{start: Date, end: Date}|null}
 */
function resolveTaskInterval(task) {
  const actualStart = parseDateUTC(task.actual_start_date);
  if (actualStart) {
    const actualEnd = parseDateUTC(task.actual_end_date);
    if (actualEnd) return { start: actualStart, end: actualEnd };

    const candidates = [
      actualStart,
      parseDateUTC(task.end_date || task.early_finish),
      endFromDuration(actualStart, task.duration_days),
    ].filter(Boolean);

    return {
      start: actualStart,
      end: new Date(Math.max(...candidates.map((d) => d.getTime()))),
    };
  }

  const planStart = parseDateUTC(task.start_date || task.early_start);
  if (planStart) {
    const planEnd =
      parseDateUTC(task.end_date || task.early_finish) ||
      endFromDuration(planStart, task.duration_days);
    if (planEnd) return { start: planStart, end: planEnd };
  }

  const manualStart = parseDateUTC(task.manual_start_date);
  const manualEnd = endFromDuration(manualStart, task.duration_days);
  if (manualStart && manualEnd) return { start: manualStart, end: manualEnd };

  return null;
}

/**
 * Chuẩn hóa một task để lấy khoảng thời gian [start_date, end_date].
 * Nguồn ngày xem resolveTaskInterval. Trả null nếu không xác định được
 * khoảng hợp lệ (thiếu ngày hoặc ngày kết thúc trước ngày bắt đầu).
 */
function normalizeTaskSchedule(task) {
  if (!task) return null;

  const interval = resolveTaskInterval(task);
  if (!interval || interval.end.getTime() < interval.start.getTime()) {
    return null;
  }

  const { start, end } = interval;

  return {
    id: task.id || task.task_id,
    name: task.name || `Công việc #${task.id || task.task_id}`,
    start_date: formatDateUTC(start),
    end_date: formatDateUTC(end),
    startMs: start.getTime(),
    endMs: end.getTime(),
    duration_days: Math.round((end.getTime() - start.getTime()) / ONE_DAY_MS) + 1,
    is_critical: Boolean(task.is_critical),
    work_item_name: task.work_item_name || "",
  };
}

/**
 * Thuật toán phát hiện quá tải công việc của đội thi công (Sweep-line Interval Algorithm).
 *
 * @param {Array<Object>} tasks - Danh sách công việc của đội (bao gồm cả việc mới sắp gán nếu đang preview)
 * @param {number} threshold - Ngưỡng số việc đồng thời cho phép (mặc định là 3 việc, > 3 việc là quá tải)
 * @returns {Object} Kết quả phân tích quá tải
 */
function detectTeamOverload(tasks, threshold = 3) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      is_overloaded: false,
      threshold,
      max_concurrent: 0,
      total_tasks_evaluated: 0,
      overloaded_intervals: [],
      message: "Đội thi công không có công việc nào có lịch trình.",
    };
  }

  // 1. Chuẩn hóa và lọc các task có khoảng thời gian hợp lệ
  const validTasks = [];
  for (const t of tasks) {
    const normalized = normalizeTaskSchedule(t);
    if (normalized) {
      validTasks.push(normalized);
    }
  }

  if (validTasks.length === 0) {
    return {
      is_overloaded: false,
      threshold,
      max_concurrent: 0,
      total_tasks_evaluated: 0,
      overloaded_intervals: [],
      message: "Không có công việc nào có đủ ngày bắt đầu và kết thúc để kiểm tra.",
    };
  }

  // Nếu tổng số task hợp lệ <= threshold thì chắc chắn không bao giờ vượt quá threshold
  if (validTasks.length <= threshold) {
    return {
      is_overloaded: false,
      threshold,
      max_concurrent: validTasks.length,
      total_tasks_evaluated: validTasks.length,
      overloaded_intervals: [],
      message: `Đội thi công hoạt động bình thường (${validTasks.length}/${threshold} việc tối đa).`,
    };
  }

  // 2. Thu thập tất cả các mốc thời gian biên (Boundaries)
  // Điểm bắt đầu của task: startMs
  // Điểm kết thúc của task: endMs (task kết thúc vào cuối ngày endMs, tức là sang ngày tiếp theo endMs + ONE_DAY_MS thì không còn active)
  const boundarySet = new Set();
  for (const t of validTasks) {
    boundarySet.add(t.startMs);
    boundarySet.add(t.endMs + ONE_DAY_MS);
  }

  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  // 3. Quét từng khoảng rời rạc giữa 2 mốc biên liên tiếp: [b[i], b[i+1] - ONE_DAY_MS]
  const rawOverloadedSpans = [];
  let globalMaxConcurrent = 0;

  for (let i = 0; i < boundaries.length - 1; i++) {
    const spanStartMs = boundaries[i];
    const spanEndMs = boundaries[i + 1] - ONE_DAY_MS;

    if (spanEndMs < spanStartMs) continue;

    // Tìm các task active trong khoảng này (S <= spanStartMs && E >= spanEndMs)
    const activeTasks = validTasks.filter(
      (t) => t.startMs <= spanStartMs && t.endMs >= spanEndMs
    );

    const concurrentCount = activeTasks.length;
    if (concurrentCount > globalMaxConcurrent) {
      globalMaxConcurrent = concurrentCount;
    }

    if (concurrentCount > threshold) {
      rawOverloadedSpans.push({
        startMs: spanStartMs,
        endMs: spanEndMs,
        concurrentCount,
        tasks: activeTasks,
      });
    }
  }

  // 4. Nếu không có khoảng nào bị quá tải
  if (rawOverloadedSpans.length === 0) {
    return {
      is_overloaded: false,
      threshold,
      max_concurrent: globalMaxConcurrent,
      total_tasks_evaluated: validTasks.length,
      overloaded_intervals: [],
      message: `Đội thi công hoạt động bình thường (cao nhất ${globalMaxConcurrent}/${threshold} việc đồng thời).`,
    };
  }

  // 5. Hợp nhất các khoảng quá tải liền kề nhau
  const mergedIntervals = [];
  let currentMerged = null;

  for (const span of rawOverloadedSpans) {
    if (!currentMerged) {
      currentMerged = {
        startMs: span.startMs,
        endMs: span.endMs,
        maxConcurrent: span.concurrentCount,
        taskMap: new Map(span.tasks.map((t) => [t.id, t])),
      };
      continue;
    }

    // Nếu span này tiếp giáp ngay sau currentMerged (startMs === currentMerged.endMs + ONE_DAY_MS)
    if (span.startMs === currentMerged.endMs + ONE_DAY_MS) {
      currentMerged.endMs = span.endMs;
      if (span.concurrentCount > currentMerged.maxConcurrent) {
        currentMerged.maxConcurrent = span.concurrentCount;
      }
      for (const t of span.tasks) {
        currentMerged.taskMap.set(t.id, t);
      }
    } else {
      // Kết thúc đoạn liền kề hiện tại, đẩy vào mảng
      mergedIntervals.push(currentMerged);
      currentMerged = {
        startMs: span.startMs,
        endMs: span.endMs,
        maxConcurrent: span.concurrentCount,
        taskMap: new Map(span.tasks.map((t) => [t.id, t])),
      };
    }
  }

  if (currentMerged) {
    mergedIntervals.push(currentMerged);
  }

  // 6. Định dạng kết quả đầu ra rõ ràng
  const formattedIntervals = mergedIntervals.map((interval) => {
    const startStr = formatDateUTC(new Date(interval.startMs));
    const endStr = formatDateUTC(new Date(interval.endMs));
    const durationDays = Math.round((interval.endMs - interval.startMs) / ONE_DAY_MS) + 1;

    const taskList = Array.from(interval.taskMap.values()).map((t) => ({
      id: t.id,
      name: t.name,
      start_date: t.start_date,
      end_date: t.end_date,
      duration_days: t.duration_days,
      is_critical: t.is_critical,
      work_item_name: t.work_item_name,
    }));

    return {
      start_date: startStr,
      end_date: endStr,
      duration_days: durationDays,
      concurrent_count: interval.maxConcurrent,
      tasks: taskList,
    };
  });

  const primaryInterval = formattedIntervals[0];
  const warningMessage =
    formattedIntervals.length === 1
      ? `Cảnh báo quá tải: Đội có ${primaryInterval.concurrent_count} công việc chồng lịch từ ngày ${formatDateVN(parseDateUTC(primaryInterval.start_date))} đến ngày ${formatDateVN(parseDateUTC(primaryInterval.end_date))} (${primaryInterval.duration_days} ngày, vượt ngưỡng ${threshold} việc).`
      : `Cảnh báo quá tải: Đội có ${formattedIntervals.length} khoảng thời gian bị chồng lịch quá ${threshold} việc (cao nhất ${globalMaxConcurrent} việc đồng thời).`;

  return {
    is_overloaded: true,
    threshold,
    max_concurrent: globalMaxConcurrent,
    total_tasks_evaluated: validTasks.length,
    overloaded_intervals: formattedIntervals,
    message: warningMessage,
  };
}

module.exports = {
  parseDateUTC,
  formatDateUTC,
  formatDateVN,
  normalizeTaskSchedule,
  detectTeamOverload,
};
