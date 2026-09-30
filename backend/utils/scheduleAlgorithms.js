/**
 * Các công thức tính toán thời điểm bắt đầu sớm nhất (Early Start - ES) của công việc sau (successor)
 * dựa trên ràng buộc từ công việc trước (predecessor).
 */

/**
 * Ràng buộc Finish-to-Start (FS): Việc sau chỉ được BẮT ĐẦU khi việc trước KẾT THÚC.
 * ES_sau >= EF_trước + lag
 */
function calculateFS(predecessorEF, lag = 0) {
  return predecessorEF + lag;
}

/**
 * Ràng buộc Start-to-Start (SS): Việc sau chỉ được BẮT ĐẦU khi việc trước BẮT ĐẦU.
 * ES_sau >= ES_trước + lag
 */
function calculateSS(predecessorES, lag = 0) {
  return predecessorES + lag;
}

/**
 * Ràng buộc Finish-to-Finish (FF): Việc sau chỉ được KẾT THÚC khi việc trước KẾT THÚC.
 * EF_sau >= EF_trước + lag
 * Mà EF_sau = ES_sau + duration_sau => ES_sau >= EF_trước + lag - duration_sau
 */
function calculateFF(predecessorEF, lag = 0, successorDuration) {
  return predecessorEF + lag - successorDuration;
}

/**
 * Ràng buộc Start-to-Finish (SF): Việc sau chỉ được KẾT THÚC khi việc trước BẮT ĐẦU.
 * EF_sau >= ES_trước + lag
 * Mà EF_sau = ES_sau + duration_sau => ES_sau >= ES_trước + lag - duration_sau
 */
function calculateSF(predecessorES, lag = 0, successorDuration) {
  return predecessorES + lag - successorDuration;
}

/**
 * Hàm duyệt xuôi để tính ES và EF cho toàn bộ mạng công việc.
 * 
 * @param {Array} tasks - Mảng các công việc [{ id, duration }, ...]
 * @param {Array} dependencies - Mảng các quan hệ [{ from, to, type, lag }, ...]
 * @param {Array} topologicalOrder - Mảng ID công việc đã được sắp xếp topo [id1, id2, ...]
 * @param {number} projectStart - Mốc bắt đầu chuẩn hóa của dự án (ví dụ: ngày 0)
 * @returns {Object} - Kết quả duyệt xuôi { [id]: { ES, EF } }
 */
function forwardPass(tasks, dependencies, topologicalOrder, projectStart = 0) {
  // Chuẩn bị dictionary cho tasks để tra cứu nhanh duration
  const taskDict = {};
  tasks.forEach((t) => {
    taskDict[t.id] = t;
  });

  // Chuẩn bị nhóm dependencies theo `to` (successor)
  // predecessorMap[toId] = [ { from, type, lag }, ... ]
  const predecessorMap = {};
  dependencies.forEach((dep) => {
    if (!predecessorMap[dep.to]) {
      predecessorMap[dep.to] = [];
    }
    predecessorMap[dep.to].push(dep);
  });

  const results = {};

  // Duyệt qua từng công việc theo thứ tự topo
  for (const taskId of topologicalOrder) {
    const task = taskDict[taskId];
    if (!task) continue;

    const duration = task.duration;
    let ES = projectStart; // Mặc định là ngày bắt đầu dự án nếu không có predecessor

    const preds = predecessorMap[taskId] || [];

    for (const pred of preds) {
      const predResult = results[pred.from];
      // Bỏ qua nếu predecessor chưa được tính toán (trong trường hợp dữ liệu lỗi,
      // nhưng với thứ tự topo chuẩn thì predResult luôn luôn có).
      if (!predResult) continue;

      const lag = pred.lag || 0;
      let possibleES = projectStart;

      switch (pred.type) {
        case 'FS':
          possibleES = calculateFS(predResult.EF, lag);
          break;
        case 'SS':
          possibleES = calculateSS(predResult.ES, lag);
          break;
        case 'FF':
          possibleES = calculateFF(predResult.EF, lag, duration);
          break;
        case 'SF':
          possibleES = calculateSF(predResult.ES, lag, duration);
          break;
        default:
          // Mặc định coi như FS nếu type không xác định hợp lệ (tuỳ business logic, 
          // ở đây ta lấy fallback an toàn)
          possibleES = calculateFS(predResult.EF, lag);
      }

      // Ràng buộc sớm nhất (ES) phải thoả mãn TẤT CẢ predecessor, nên lấy MAX
      if (possibleES > ES) {
        ES = possibleES;
      }
    }

    const EF = ES + duration;
    results[taskId] = { ES, EF };
  }

  return results;
}

module.exports = {
  calculateFS,
  calculateSS,
  calculateFF,
  calculateSF,
  forwardPass,
};
