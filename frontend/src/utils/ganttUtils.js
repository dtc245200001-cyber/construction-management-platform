import { differenceInCalendarDays, parseISO } from 'date-fns';

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
    
    return {
      ...task,
      x,
      y: index * rowHeight,
      width,
      height: rowHeight * 0.6
    };
  }).filter(Boolean);
}
