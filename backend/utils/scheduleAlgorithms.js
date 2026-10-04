/**
 * Scheduling / CPM helpers for S-08/S-09.
 * T-18/T-19: dependency formulas + forward pass
 * T-20/T-21: backward pass + float/critical flag
 */

/**
 * Ràng buộc Finish-to-Start (FS):
 * - Xuôi: Việc sau chỉ bắt đầu khi việc trước kết thúc: ES_sau >= EF_trước + lag
 * - Ngược: Việc trước phải kết thúc để việc sau kịp bắt đầu: LF_trước <= LS_sau - lag
 */
function calculateFS(predecessorEF, lag = 0) {
  return predecessorEF + lag;
}

function calculateBackwardFS(successorLS, lag = 0) {
  return successorLS - lag;
}

/**
 * Ràng buộc Start-to-Start (SS):
 * - Xuôi: Việc sau chỉ bắt đầu khi việc trước bắt đầu: ES_sau >= ES_trước + lag
 * - Ngược: Việc trước phải bắt đầu để việc sau kịp bắt đầu: LS_trước <= LS_sau - lag
 *          => LF_trước <= LS_sau - lag + predecessorDuration
 */
function calculateSS(predecessorES, lag = 0) {
  return predecessorES + lag;
}

function calculateBackwardSS(successorLS, lag = 0, predecessorDuration) {
  return successorLS - lag + predecessorDuration;
}

/**
 * Ràng buộc Finish-to-Finish (FF):
 * - Xuôi: Việc sau chỉ kết thúc khi việc trước kết thúc: EF_sau >= EF_trước + lag
 *          => ES_sau >= EF_trước + lag - successorDuration
 * - Ngược: Việc trước phải kết thúc để việc sau kịp kết thúc: LF_trước <= LF_sau - lag
 */
function calculateFF(predecessorEF, lag = 0, successorDuration) {
  return predecessorEF + lag - successorDuration;
}

function calculateBackwardFF(successorLF, lag = 0) {
  return successorLF - lag;
}

/**
 * Ràng buộc Start-to-Finish (SF):
 * - Xuôi: Việc sau chỉ kết thúc khi việc trước bắt đầu: EF_sau >= ES_trước + lag
 *          => ES_sau >= ES_trước + lag - successorDuration
 * - Ngược: Việc trước phải bắt đầu để việc sau kịp kết thúc: LS_trước <= LF_sau - lag
 *          => LF_trước <= LF_sau - lag + predecessorDuration
 */
function calculateSF(predecessorES, lag = 0, successorDuration) {
  return predecessorES + lag - successorDuration;
}

function calculateBackwardSF(successorLF, lag = 0, predecessorDuration) {
  return successorLF - lag + predecessorDuration;
}

const calculateFSBackward = calculateBackwardFS;
const calculateSSBackward = calculateBackwardSS;
const calculateFFBackward = calculateBackwardFF;
const calculateSFBackward = calculateBackwardSF;

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
  const taskDict = {};
  tasks.forEach((t) => {
    taskDict[t.id] = t;
  });

  const predecessorMap = {};
  dependencies.forEach((dep) => {
    if (!predecessorMap[dep.to]) predecessorMap[dep.to] = [];
    predecessorMap[dep.to].push(dep);
  });

  const results = {};

  for (const taskId of topologicalOrder) {
    const task = taskDict[taskId];
    if (!task) continue;

    const duration = task.duration;
    let ES = projectStart;
    const preds = predecessorMap[taskId] || [];

    for (const pred of preds) {
      const predResult = results[pred.from];
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
          possibleES = calculateFS(predResult.EF, lag);
      }

      if (possibleES > ES) ES = possibleES;
    }

    const EF = ES + duration;
    results[taskId] = { ES, EF };
  }

  return results;
}

/**
 * Duyệt ngược (Backward Pass) theo thứ tự đảo của topo để tính LF và LS.
 * Bắt đầu từ ngày hoàn thành dự án, với mỗi việc lấy giá trị nhỏ nhất trong các ràng buộc từ việc sau.
 * 
 * @param {Array} tasks - Mảng các công việc [{ id, duration }, ...]
 * @param {Array} dependencies - Mảng quan hệ [{ from, to, type, lag }, ...]
 * @param {Array} topologicalOrder - Mảng ID công việc theo thứ tự topo [id1, id2, ...]
 * @param {Object} earlyResults - Kết quả duyệt xuôi { [id]: { ES, EF } }
 * @returns {Object} - Kết quả duyệt ngược { [id]: { LS, LF } }
 */
function backwardPass(tasks, dependencies, topologicalOrder, earlyResults) {
  const taskDict = {};
  tasks.forEach((t) => {
    taskDict[t.id] = t;
  });

  const successorMap = {};
  dependencies.forEach((dep) => {
    if (!successorMap[dep.from]) successorMap[dep.from] = [];
    successorMap[dep.from].push(dep);
  });

  const projectFinish = Math.max(
    ...Object.values(earlyResults).map((result) => result.EF)
  );

  const results = {};

  for (const taskId of [...topologicalOrder].reverse()) {
    const task = taskDict[taskId];
    if (!task) continue;

    const successors = successorMap[taskId] || [];
    let LF = projectFinish;

    if (successors.length > 0) {
      const candidateLFs = successors.map((dep) => {
        const successor = results[dep.to];
        if (!successor) return projectFinish;

        const lag = dep.lag || 0;

        switch (dep.type) {
          case 'FS':
            return calculateBackwardFS(successor.LS, lag);
          case 'SS':
            return calculateBackwardSS(successor.LS, lag, task.duration);
          case 'FF':
            return calculateBackwardFF(successor.LF, lag);
          case 'SF':
            return calculateBackwardSF(successor.LF, lag, task.duration);
          default:
            return calculateBackwardFS(successor.LS, lag);
        }
      });

      LF = Math.min(...candidateLFs);
    }

    results[taskId] = {
      LS: LF - task.duration,
      LF,
    };
  }

  return results;
}

/**
 * Tính độ trễ cho phép (Total Float - T-21):
 * Độ trễ cho phép bằng khởi muộn (LS) trừ khởi sớm (ES).
 * Làm tròn về số nguyên ngày để tránh sai số số thực.
 *
 * @param {number} LS - Khởi muộn
 * @param {number} ES - Khởi sớm
 * @returns {number} - Độ trễ toàn phần tính theo số nguyên ngày
 */
function calculateTotalFloat(LS, ES) {
  return Math.round(Number(LS) - Number(ES));
}

/**
 * Đánh dấu việc găng (Critical Task - T-21):
 * Việc có độ trễ bằng 0 là găng.
 * Ràng buộc: so sánh bằng 0 trên số nguyên ngày, không so trên số thực.
 *
 * @param {number} totalFloat - Độ trễ cho phép
 * @returns {boolean} - true nếu là việc găng, false nếu không
 */
function isCriticalTask(totalFloat) {
  const intFloat = Math.trunc(Math.round(Number(totalFloat)));
  return intFloat === 0;
}

function calculateSchedule(
  tasks,
  dependencies,
  topologicalOrder,
  projectStart = 0
) {
  const early = forwardPass(
    tasks,
    dependencies,
    topologicalOrder,
    projectStart
  );

  const late = backwardPass(
    tasks,
    dependencies,
    topologicalOrder,
    early
  );

  const results = {};

  tasks.forEach((task) => {
    const id = task.id;
    const ES = early[id].ES;
    const EF = early[id].EF;
    const LS = late[id].LS;
    const LF = late[id].LF;
    const totalFloat = calculateTotalFloat(LS, ES);
    const critical = isCriticalTask(totalFloat);

    results[id] = {
      ES,
      EF,
      LS,
      LF,
      float: totalFloat,
      critical,
    };
  });

  return results;
}

module.exports = {
  calculateFS,
  calculateBackwardFS,
  calculateFSBackward,
  calculateSS,
  calculateBackwardSS,
  calculateSSBackward,
  calculateFF,
  calculateBackwardFF,
  calculateFFBackward,
  calculateSF,
  calculateBackwardSF,
  calculateSFBackward,
  forwardPass,
  backwardPass,
  calculateTotalFloat,
  isCriticalTask,
  calculateSchedule,
};
