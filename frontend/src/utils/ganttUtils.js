import { differenceInCalendarDays, parseISO, addDays, format } from 'date-fns';

/**
 * Chuyển đổi một ngày (date) thành toạ độ X (pixel) trên trục thời gian.
 * @param {string|Date} date - Ngày cần tính (VD: "2026-10-12")
 * @param {string|Date} projectStartDate - Ngày bắt đầu của dự án (Mốc X = 0)
 * @param {number} pixelsPerDay - Độ rộng của 1 ngày trên màn hình (VD: 20px)
 * @returns {number} Toạ độ X
 */
export function dateToX(date, projectStartDate, pixelsPerDay) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const start = typeof projectStartDate === 'string' ? parseISO(projectStartDate) : projectStartDate;

  const diffDays = differenceInCalendarDays(d, start);
  return diffDays * pixelsPerDay;
}

export function mapScheduleToGantt(tasks, projectStartDate, pixelsPerDay, rowHeight = 40) {
  if (!tasks || !Array.isArray(tasks)) return [];

  return tasks.map((task, index) => {
    if (!task.early_start || !task.early_finish) return null;

    const x = dateToX(task.early_start, projectStartDate, pixelsPerDay);

    const startObj = parseISO(task.early_start);
    const finishObj = parseISO(task.early_finish);
    const diffDays = differenceInCalendarDays(finishObj, startObj);
    const width = (diffDays + 1) * pixelsPerDay;

    // T-42: toạ độ thanh kế hoạch gốc (null nếu việc này chưa có trong bản chốt)
    let baseline = null;
    if (task.planned_early_start && task.planned_early_finish) {
      const bs = parseISO(task.planned_early_start);
      const bf = parseISO(task.planned_early_finish);
      baseline = {
        x: dateToX(task.planned_early_start, projectStartDate, pixelsPerDay),
        width: (differenceInCalendarDays(bf, bs) + 1) * pixelsPerDay,
      };
    }

    return {
      ...task,
      x,
      y: index * rowHeight,
      width,
      height: rowHeight * 0.6,
      baseline,
    };
  }).filter(Boolean);
}

/**
 * Sinh danh sách các vạch và nhãn trên trục thời gian.
 * @param {string|Date} projectStartDate 
 * @param {number} totalDays - Tổng số ngày dự kiến cần vẽ
 * @param {string} viewMode - 'day' hoặc 'week'
 * @param {number} pixelsPerDay 
 * @param {Object} calendar
 * @param {Array} holidays
 * @returns {Array} Mảng các mốc thời gian { x, label, type, isNonWorkingDay }
 */
export function generateTimelineTicks(projectStartDate, totalDays, viewMode, pixelsPerDay, calendar = null, holidays = []) {
  if (!projectStartDate) return [];
  const startObj = typeof projectStartDate === 'string' ? parseISO(projectStartDate) : projectStartDate;
  const ticks = [];

  const dayMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  
  if (viewMode === 'day') {
    for (let i = 0; i <= totalDays; i++) {
      const date = addDays(startObj, i);
      
      let isNonWorkingDay = false;
      if (calendar) {
        const dayName = dayMap[date.getDay()];
        if (!calendar[dayName]) isNonWorkingDay = true;
      }
      const dateStr = format(date, 'yyyy-MM-dd');
      if (holidays && holidays.some(h => (h.holiday_date || h).substring(0, 10) === dateStr)) {
        isNonWorkingDay = true;
      }

      ticks.push({
        x: i * pixelsPerDay,
        label: format(date, 'dd/MM/yyyy'),
        type: 'day',
        isNonWorkingDay
      });
    }
  } else if (viewMode === 'week') {
    for (let i = 0; i <= totalDays; i += 7) {
      const date = addDays(startObj, i);
      ticks.push({
        x: i * pixelsPerDay,
        label: `T${Math.floor(i / 7) + 1} (${format(date, 'dd/MM/yyyy')})`,
        type: 'week',
        isNonWorkingDay: false
      });
    }
  }

  return ticks;
}
