const fs = require('fs');

const tasks = [
  { id: 'A', duration: 3 },
  { id: 'B', duration: 4 },
  { id: 'C', duration: 2 },
  { id: 'D', duration: 5 },
  { id: 'E', duration: 3 },
  { id: 'F', duration: 4 },
  { id: 'G', duration: 2 },
  { id: 'H', duration: 3 },
  { id: 'I', duration: 2 },
  { id: 'J', duration: 1 }
];

const deps = [
  { from: 'A', to: 'B' }, { from: 'A', to: 'C' },
  { from: 'B', to: 'D' }, { from: 'B', to: 'E' },
  { from: 'C', to: 'F' }, { from: 'D', to: 'G' },
  { from: 'E', to: 'G' }, { from: 'E', to: 'H' },
  { from: 'F', to: 'H' }, { from: 'G', to: 'I' },
  { from: 'H', to: 'I' }, { from: 'I', to: 'J' }
];

const topologicalOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const reverseOrder = [...topologicalOrder].reverse();

function calculateScenario(actuals, today) {
  const nodeData = {};
  for (const t of tasks) {
    let ES = null;
    let EF = null;
    let effectiveDuration = t.duration;
    let isPinned = false;
    let isStarted = false;

    if (actuals[t.id]) {
      const act = actuals[t.id];
      if (act.percent === 100) {
        ES = act.actualStart;
        EF = act.actualEnd;
        effectiveDuration = EF - ES;
        isPinned = true;
        isStarted = true;
      } else {
        const remaining = Math.ceil(t.duration * (100 - act.percent) / 100);
        ES = act.actualStart;
        EF = Math.max(ES + t.duration, today + remaining);
        effectiveDuration = EF - ES;
        isPinned = true;
        isStarted = true;
      }
    }

    nodeData[t.id] = { id: t.id, originalDuration: t.duration, effectiveDuration, isPinned, isStarted, ES, EF, LS: null, LF: null, float: null, critical: false };
  }

  // Forward Pass
  for (const u of topologicalOrder) {
    const node = nodeData[u];
    if (!node.isPinned) {
      let maxPredEF = 0;
      for (const d of deps) {
        if (d.to === u) {
          const pred = nodeData[d.from];
          if (pred.EF > maxPredEF) maxPredEF = pred.EF;
        }
      }
      node.ES = maxPredEF;
      node.EF = node.ES + node.effectiveDuration;
    }
  }

  const projectFinish = Math.max(...Object.values(nodeData).map(n => n.EF));

  // Backward Pass
  for (const u of reverseOrder) {
    const node = nodeData[u];
    let minSuccLS = projectFinish;
    let hasSucc = false;
    for (const d of deps) {
      if (d.from === u) {
        hasSucc = true;
        const succ = nodeData[d.to];
        if (succ.LS < minSuccLS) minSuccLS = succ.LS;
      }
    }
    
    if (node.isPinned) {
      // If a task is pinned (started/finished), the prompt says:
      // "việc đã hoàn thành chỉ cố định ES/EF theo thực tế, không ép cờ găng, cờ và float rút ra từ duyệt ngược"
      // "mọi việc ghim có LF - LS = EF - ES" -> So we calculate LS and LF such that LF - LS = effectiveDuration
      // Normally LF = minSuccLS, LS = LF - effectiveDuration.
      node.LF = minSuccLS;
      node.LS = node.LF - node.effectiveDuration;
    } else {
      node.LF = minSuccLS;
      node.LS = node.LF - node.effectiveDuration;
    }

    node.float = node.LS - node.ES;
    if (node.float < 0) node.float = 0; // The prompt requires no negative float
    // Actually, "không float âm" rule means if LF < EF due to actuals pushing successors? Wait.
    // In strict CPM, if a successor is pinned earlier, we might get negative float. But our logic is simple.
    // Let's just clamp float to >= 0
    if (node.float === 0) node.critical = true;
  }

  return { expected: Object.values(nodeData).map(n => ({ id: n.id, ES: n.ES, EF: n.EF, LS: n.LS, LF: n.LF, float: n.float, critical: n.critical })), projectFinish };
}

const scenarios = [
  {
    "id": "ca1_viec_gang_tre_3",
    "today": null,
    "actuals": { "D": { "actualStart": 7, "actualEnd": 15, "percent": 100 } }
  },
  {
    "id": "ca2_khong_gang_tre_it_hon_float",
    "today": null,
    "actuals": { "C": { "actualStart": 3, "actualEnd": 6, "percent": 100 } }
  },
  {
    "id": "ca3_khong_gang_tre_qua_float",
    "today": null,
    "actuals": { "E": { "actualStart": 7, "actualEnd": 13, "percent": 100 } }
  },
  {
    "id": "ca4a_dang_lam_hom_nay_som",
    "today": 8,
    "actuals": { "D": { "actualStart": 7, "actualEnd": null, "percent": 40 } }
  },
  {
    "id": "ca4b_dang_lam_hom_nay_tre",
    "today": 11,
    "actuals": { "D": { "actualStart": 7, "actualEnd": null, "percent": 40 } }
  }
];

const results = [];
for (const s of scenarios) {
  const { expected, projectFinish } = calculateScenario(s.actuals, s.today);
  results.push({
    ...s,
    calculatedBy: "TẠM - script tham chiếu, CHƯA tính tay",
    calculatedDate: new Date().toISOString().split('T')[0],
    provisional: true,
    expected,
    projectFinish
  });
}

// Check ca1
const ca1 = results[0];
if (ca1.projectFinish !== 20) console.error("ca1 failed", ca1.projectFinish);

const file = 'backend/__tests__/fixtures/k01-expected.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.actualScenarios = results;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
