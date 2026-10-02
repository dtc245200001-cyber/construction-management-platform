/**
 * Scheduling / CPM helpers for S-08/S-09.
 * T-18/T-19: dependency formulas + forward pass
 * T-20/T-21: backward pass + float/critical flag
 */

function calculateFS(predecessorEF, lag = 0) {
  return predecessorEF + lag;
}

function calculateSS(predecessorES, lag = 0) {
  return predecessorES + lag;
}

function calculateFF(predecessorEF, lag = 0, successorDuration) {
  return predecessorEF + lag - successorDuration;
}

function calculateSF(predecessorES, lag = 0, successorDuration) {
  return predecessorES + lag - successorDuration;
}

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
 * Backward pass for FS/SS/FF/SF relationships.
 * Starts from the project finish obtained from the forward pass.
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
            // EF_pred <= ES_succ - lag
            return successor.LS - lag;
          case 'SS':
            // ES_pred <= ES_succ - lag
            return successor.LS - lag + task.duration;
          case 'FF':
            // EF_pred <= EF_succ - lag
            return successor.LF - lag;
          case 'SF':
            // ES_pred <= EF_succ - lag
            return successor.LF - lag + task.duration;
          default:
            return successor.LS - lag;
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
    const totalFloat = LS - ES;

    results[id] = {
      ES,
      EF,
      LS,
      LF,
      float: totalFloat,
      critical: totalFloat === 0,
    };
  });

  return results;
}

module.exports = {
  calculateFS,
  calculateSS,
  calculateFF,
  calculateSF,
  forwardPass,
  backwardPass,
  calculateSchedule,
};
