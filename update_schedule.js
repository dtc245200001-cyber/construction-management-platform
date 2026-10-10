const fs = require('fs');
const file = 'backend/services/scheduleCalculation.js';
let content = fs.readFileSync(file, 'utf8');

const startMarker = 'const tasks = Object.values(graph.nodes).map((task) => {';
const endMarker = '  const dependencies = [];';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex > -1 && endIndex > -1) {
  const newLogic = `  const projStart = parseDate(project.start_date);
  let todayOffset = 0;
  if (parseDate(todayDateStr).getTime() >= projStart.getTime()) {
    todayOffset = countWorkingDays(project.start_date, todayDateStr, calendar, holidays) - 1;
  }

  const tasks = Object.values(graph.nodes).map((task) => {
    // Logic thuc te (Buoc 3)
    if (task.actual_start_date) {
      let offsetStart = 0;
      const taskStart = parseDate(task.actual_start_date);
      if (taskStart.getTime() >= projStart.getTime()) {
        offsetStart = countWorkingDays(project.start_date, task.actual_start_date, calendar, holidays) - 1;
      } else {
        offsetStart = -(countWorkingDays(task.actual_start_date, project.start_date, calendar, holidays) - 1);
      }
      offsetStart = Math.max(0, offsetStart);

      if (task.actual_end_date) {
        // Da hoan thanh
        let offsetEnd = 0;
        const taskEnd = parseDate(task.actual_end_date);
        if (taskEnd.getTime() >= projStart.getTime()) {
          offsetEnd = countWorkingDays(project.start_date, task.actual_end_date, calendar, holidays) - 1;
        } else {
          offsetEnd = -(countWorkingDays(task.actual_end_date, project.start_date, calendar, holidays) - 1);
        }
        
        const ES = offsetStart;
        const EF = offsetEnd + 1;
        
        return {
          ...task,
          manualOffset: ES,
          duration: Math.max(0, EF - ES),
          isActual: true,
          schedulingMode: 'manual'
        };
      } else {
        // Dang lam
        const ES = offsetStart;
        const percent = task.percent_complete || 0;
        const remaining = Math.ceil(task.duration * (100 - percent) / 100);
        const EF = Math.max(ES + task.duration, todayOffset + remaining);
        
        return {
          ...task,
          manualOffset: ES,
          duration: Math.max(0, EF - ES),
          isActual: true,
          schedulingMode: 'manual'
        };
      }
    }

    if (task.schedulingMode === 'manual' && task.manualStartDate) {
      let offset = 0;
      const taskStart = parseDate(task.manualStartDate);
      if (taskStart.getTime() >= projStart.getTime()) {
        offset = countWorkingDays(project.start_date, task.manualStartDate, calendar, holidays) - 1;
      } else {
        offset = -(countWorkingDays(task.manualStartDate, project.start_date, calendar, holidays) - 1);
      }
      return { ...task, manualOffset: Math.max(0, offset) };
    }
    return task;
  });

`;
  
  content = content.substring(0, startIndex) + newLogic + content.substring(endIndex);
  fs.writeFileSync(file, content);
  console.log('Replaced successfully');
} else {
  console.log('Markers not found');
}
