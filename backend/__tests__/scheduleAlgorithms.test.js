const {
  calculateFS,
  calculateBackwardFS,
  calculateSS,
  calculateBackwardSS,
  calculateFF,
  calculateBackwardFF,
  calculateSF,
  calculateBackwardSF,
  forwardPass,
  backwardPass,
  calculateTotalFloat,
  isCriticalTask,
  calculateSchedule,
} = require('../utils/scheduleAlgorithms');
const k01 = require('./fixtures/k01-expected.json');

describe('T-18: Dependency Formulas (Development test fixture, not K-01 acceptance data)', () => {
  test('calculateFS should return predecessorEF + lag', () => {
    // ES_sau >= EF_trước + lag
    expect(calculateFS(10, 2)).toBe(12);
    expect(calculateFS(5, -1)).toBe(4);
    expect(calculateFS(8)).toBe(8); // lag = 0
  });

  test('calculateSS should return predecessorES + lag', () => {
    // ES_sau >= ES_trước + lag
    expect(calculateSS(3, 4)).toBe(7);
    expect(calculateSS(5, -2)).toBe(3);
    expect(calculateSS(6)).toBe(6);
  });

  test('calculateFF should return predecessorEF + lag - successorDuration', () => {
    // EF_sau >= EF_trước + lag => ES_sau >= EF_trước + lag - duration
    // EF_trước = 15, lag = 2, duration = 4 => ES = 15 + 2 - 4 = 13
    expect(calculateFF(15, 2, 4)).toBe(13);
    expect(calculateFF(20, -3, 5)).toBe(12);
  });

  test('calculateSF should return predecessorES + lag - successorDuration', () => {
    // EF_sau >= ES_trước + lag => ES_sau >= ES_trước + lag - duration
    // ES_trước = 10, lag = 5, duration = 3 => ES = 10 + 5 - 3 = 12
    expect(calculateSF(10, 5, 3)).toBe(12);
    expect(calculateSF(10, -2, 2)).toBe(6);
  });
});

describe('T-19: Forward Pass Algorithm (Development test fixture, algorithm implemented, pending K-01 verification)', () => {
  test('forwardPass should correctly compute ES and EF for a given graph', () => {
    // Development test fixture, not K-01 acceptance data.
    const tasks = [
      { id: 1, duration: 3 },
      { id: 2, duration: 4 },
      { id: 3, duration: 2 },
      { id: 4, duration: 5 }
    ];

    const dependencies = [
      { from: 1, to: 2, type: 'FS', lag: 0 },   // t2 starts when t1 finishes
      { from: 1, to: 3, type: 'SS', lag: 1 },   // t3 starts 1 day after t1 starts
      { from: 2, to: 4, type: 'FF', lag: 0 },   // t4 finishes when t2 finishes
      { from: 3, to: 4, type: 'SF', lag: 12 }   // t4 finishes 12 days after t3 starts
    ];

    const topologicalOrder = [1, 2, 3, 4];
    const projectStart = 0;

    const results = forwardPass(tasks, dependencies, topologicalOrder, projectStart);

    // Expected calculations:
    // Task 1: No preds -> ES = 0, EF = 3
    // Task 2: pred(1) FS(0) -> ES = 3 + 0 = 3, EF = 3 + 4 = 7
    // Task 3: pred(1) SS(1) -> ES = 0 + 1 = 1, EF = 1 + 2 = 3
    // Task 4: 
    //   - pred(2) FF(0): possibleES = EF2(7) + 0 - dur(5) = 2
    //   - pred(3) SF(12): possibleES = ES3(1) + 12 - dur(5) = 8
    //   => MAX(2, 8) = 8. So ES = 8, EF = 8 + 5 = 13
    
    expect(results[1]).toEqual({ ES: 0, EF: 3 });
    expect(results[2]).toEqual({ ES: 3, EF: 7 });
    expect(results[3]).toEqual({ ES: 1, EF: 3 });
    expect(results[4]).toEqual({ ES: 8, EF: 13 });
  });

  test('forwardPass should fallback to project start if no predecessors', () => {
    const tasks = [
      { id: 10, duration: 5 },
      { id: 11, duration: 6 }
    ];
    const results = forwardPass(tasks, [], [10, 11], 100);
    expect(results[10]).toEqual({ ES: 100, EF: 105 });
    expect(results[11]).toEqual({ ES: 100, EF: 106 });
  });

  test('forwardPass should handle negative lag correctly', () => {
    // Development test fixture, not K-01 acceptance data.
    const tasks = [
      { id: 5, duration: 4 },
      { id: 6, duration: 3 }
    ];
    // task 6 starts when task 5 finishes BUT with a -2 day lag
    const dependencies = [
      { from: 5, to: 6, type: 'FS', lag: -2 }
    ];
    const results = forwardPass(tasks, dependencies, [5, 6], 0);
    // T5: ES = 0, EF = 4
    // T6: ES = max(0, 4 + (-2)) = 2, EF = 2 + 3 = 5
    expect(results[5]).toEqual({ ES: 0, EF: 4 });
    expect(results[6]).toEqual({ ES: 2, EF: 5 });
  });
});

describe('T-20: Backward Dependency Formulas (S-09)', () => {
  test('calculateBackwardFS should return successorLS - lag', () => {
    // LF_trước <= LS_sau - lag
    expect(calculateBackwardFS(12, 2)).toBe(10);
    expect(calculateBackwardFS(4, -1)).toBe(5);
    expect(calculateBackwardFS(8)).toBe(8); // lag = 0
  });

  test('calculateBackwardSS should return successorLS - lag + predecessorDuration', () => {
    // LS_trước <= LS_sau - lag => LF_trước <= LS_sau - lag + duration_trước
    expect(calculateBackwardSS(7, 4, 3)).toBe(6);
    expect(calculateBackwardSS(3, -2, 4)).toBe(9);
    expect(calculateBackwardSS(6, 0, 5)).toBe(11);
  });

  test('calculateBackwardFF should return successorLF - lag', () => {
    // LF_trước <= LF_sau - lag
    expect(calculateBackwardFF(13, 2)).toBe(11);
    expect(calculateBackwardFF(12, -3)).toBe(15);
    expect(calculateBackwardFF(10)).toBe(10); // lag = 0
  });

  test('calculateBackwardSF should return successorLF - lag + predecessorDuration', () => {
    // LS_trước <= LF_sau - lag => LF_trước <= LF_sau - lag + duration_trước
    expect(calculateBackwardSF(12, 5, 3)).toBe(10);
    expect(calculateBackwardSF(6, -2, 2)).toBe(10);
    expect(calculateBackwardSF(8, 0, 4)).toBe(12);
  });
});

describe('T-20: Backward Pass Algorithm (S-09)', () => {
  test('backwardPass should correctly compute LS and LF for the development fixture', () => {
    const tasks = [
      { id: 1, duration: 3 },
      { id: 2, duration: 4 },
      { id: 3, duration: 2 },
      { id: 4, duration: 5 }
    ];

    const dependencies = [
      { from: 1, to: 2, type: 'FS', lag: 0 },
      { from: 1, to: 3, type: 'SS', lag: 1 },
      { from: 2, to: 4, type: 'FF', lag: 0 },
      { from: 3, to: 4, type: 'SF', lag: 12 }
    ];

    const topologicalOrder = [1, 2, 3, 4];
    const earlyResults = forwardPass(tasks, dependencies, topologicalOrder, 0);

    const lateResults = backwardPass(tasks, dependencies, topologicalOrder, earlyResults);

    // Expected backward calculations:
    // projectFinish = EF4 = 13
    // Task 4: no successors => LF = 13, LS = 13 - 5 = 8
    // Task 3: succ(4) SF(12) => LF = 13 - 12 + 2 = 3, LS = 3 - 2 = 1
    // Task 2: succ(4) FF(0)  => LF = 13 - 0 = 13, LS = 13 - 4 = 9
    // Task 1: succ(2) FS(0) => LF_cand1 = 9 - 0 = 9
    //         succ(3) SS(1) => LF_cand2 = 1 - 1 + 3 = 3
    //         => MIN(9, 3) = 3, LS = 3 - 3 = 0
    expect(lateResults[1]).toEqual({ LS: 0, LF: 3 });
    expect(lateResults[2]).toEqual({ LS: 9, LF: 13 });
    expect(lateResults[3]).toEqual({ LS: 1, LF: 3 });
    expect(lateResults[4]).toEqual({ LS: 8, LF: 13 });
  });

  test('backwardPass should set LF to projectFinish for tasks with no successors', () => {
    const tasks = [
      { id: 'T1', duration: 3 },
      { id: 'T2', duration: 5 }
    ];
    const earlyResults = {
      T1: { ES: 0, EF: 3 },
      T2: { ES: 0, EF: 5 }
    };
    const lateResults = backwardPass(tasks, [], ['T1', 'T2'], earlyResults);

    expect(lateResults['T1']).toEqual({ LS: 2, LF: 5 });
    expect(lateResults['T2']).toEqual({ LS: 0, LF: 5 });
  });

  test('backwardPass results match khởi muộn (LS) và kết muộn (LF) trong bảng đáp án K-01', () => {
    const earlyResults = forwardPass(
      k01.tasks,
      k01.dependencies,
      k01.topologicalOrder,
      k01.projectStart
    );

    const lateResults = backwardPass(
      k01.tasks,
      k01.dependencies,
      k01.topologicalOrder,
      earlyResults
    );

    // Đối chiếu từng công việc trong K-01 với cột khởi muộn (LS) và kết muộn (LF)
    k01.expected.forEach((expectedRow) => {
      const actual = lateResults[expectedRow.id];
      expect(actual).toBeDefined();
      expect(actual.LS).toBe(expectedRow.LS);
      expect(actual.LF).toBe(expectedRow.LF);
    });
  });
});

describe('T-21: Total Float & Critical Task Flagging (S-09)', () => {
  describe('calculateTotalFloat and isCriticalTask unit tests', () => {
    test('calculateTotalFloat should return LS - ES as an integer', () => {
      // Độ trễ cho phép bằng khởi muộn trừ khởi sớm
      expect(calculateTotalFloat(5, 3)).toBe(2);
      expect(calculateTotalFloat(3, 3)).toBe(0);
      expect(calculateTotalFloat(12, 7)).toBe(5);
    });

    test('isCriticalTask should return true only when totalFloat is 0 (integer comparison)', () => {
      // Việc có độ trễ bằng 0 là găng; so sánh trên số nguyên ngày
      expect(isCriticalTask(0)).toBe(true);
      expect(isCriticalTask(1)).toBe(false);
      expect(isCriticalTask(2)).toBe(false);
      expect(isCriticalTask(-0)).toBe(true);
    });
  });

  describe('calculateSchedule on K-01 sample network', () => {
    test('critical flags and float values match K-01 hand-calculated answer table', () => {
      const schedule = calculateSchedule(
        k01.tasks,
        k01.dependencies,
        k01.topologicalOrder,
        k01.projectStart
      );

      // Mọi việc trong K-01 có float và critical khớp bảng đáp án tính tay
      k01.expected.forEach((expectedRow) => {
        const actual = schedule[expectedRow.id];
        expect(actual).toBeDefined();
        expect(actual.float).toBe(expectedRow.float);
        expect(actual.critical).toBe(expectedRow.critical);
        expect(actual.ES).toBe(expectedRow.ES);
        expect(actual.EF).toBe(expectedRow.EF);
        expect(actual.LS).toBe(expectedRow.LS);
        expect(actual.LF).toBe(expectedRow.LF);
      });

      // Tập việc găng khớp đường găng vẽ tay ở K-01
      const criticalTasks = k01.topologicalOrder.filter(
        (id) => schedule[id].critical
      );
      expect(criticalTasks).toEqual(k01.criticalPath);
    });
  });

  describe('Parallel branches and critical path coverage', () => {
    test('mạng có hai đường găng song song thì cả hai đều được đánh dấu (T-21 AC)', () => {
      // Mạng có 2 nhánh song song cùng chiều dài:
      // Start (dur: 2) -> P1 (dur: 4) -> P2 (dur: 3) -> End (dur: 2)
      //               \-> Q1 (dur: 5) -> Q2 (dur: 2) -> End
      // Nhánh P: 4 + 3 = 7 ngày.
      // Nhánh Q: 5 + 2 = 7 ngày.
      // Cả 2 nhánh dài bằng nhau và đều nằm trên đường găng (tổng 2 + 7 + 2 = 11 ngày)
      const tasks = [
        { id: 'START', duration: 2 },
        { id: 'P1', duration: 4 },
        { id: 'P2', duration: 3 },
        { id: 'Q1', duration: 5 },
        { id: 'Q2', duration: 2 },
        { id: 'END', duration: 2 },
      ];

      const dependencies = [
        { from: 'START', to: 'P1', type: 'FS', lag: 0 },
        { from: 'P1', to: 'P2', type: 'FS', lag: 0 },
        { from: 'P2', to: 'END', type: 'FS', lag: 0 },
        { from: 'START', to: 'Q1', type: 'FS', lag: 0 },
        { from: 'Q1', to: 'Q2', type: 'FS', lag: 0 },
        { from: 'Q2', to: 'END', type: 'FS', lag: 0 },
      ];

      const topologicalOrder = ['START', 'P1', 'P2', 'Q1', 'Q2', 'END'];

      const schedule = calculateSchedule(tasks, dependencies, topologicalOrder, 0);

      // Cả hai nhánh song song đều phải được đánh dấu găng (critical = true, float = 0)
      expect(schedule['START']).toEqual({
        ES: 0, EF: 2, LS: 0, LF: 2, float: 0, critical: true,
      });
      expect(schedule['P1']).toEqual({
        ES: 2, EF: 6, LS: 2, LF: 6, float: 0, critical: true,
      });
      expect(schedule['P2']).toEqual({
        ES: 6, EF: 9, LS: 6, LF: 9, float: 0, critical: true,
      });
      expect(schedule['Q1']).toEqual({
        ES: 2, EF: 7, LS: 2, LF: 7, float: 0, critical: true,
      });
      expect(schedule['Q2']).toEqual({
        ES: 7, EF: 9, LS: 7, LF: 9, float: 0, critical: true,
      });
      expect(schedule['END']).toEqual({
        ES: 9, EF: 11, LS: 9, LF: 11, float: 0, critical: true,
      });

      const allCritical = tasks.every((t) => schedule[t.id].critical);
      expect(allCritical).toBe(true);
    });

    test('nhánh song song dài hơn nằm trên đường găng, nhánh ngắn hơn có độ trễ dương đúng bằng chênh lệch (S-09 AC)', () => {
      // Start (dur: 2)
      // Nhánh dài: L1 (dur: 6) -> End (dur: 2) -> nhánh dài: 6 ngày
      // Nhánh ngắn: S1 (dur: 4) -> End          -> nhánh ngắn: 4 ngày
      // Chênh lệch = 6 - 4 = 2 ngày. Nhánh ngắn có float = 2.
      const tasks = [
        { id: 'START', duration: 2 },
        { id: 'L1', duration: 6 },
        { id: 'S1', duration: 4 },
        { id: 'END', duration: 2 },
      ];

      const dependencies = [
        { from: 'START', to: 'L1', type: 'FS', lag: 0 },
        { from: 'L1', to: 'END', type: 'FS', lag: 0 },
        { from: 'START', to: 'S1', type: 'FS', lag: 0 },
        { from: 'S1', to: 'END', type: 'FS', lag: 0 },
      ];

      const topologicalOrder = ['START', 'L1', 'S1', 'END'];
      const schedule = calculateSchedule(tasks, dependencies, topologicalOrder, 0);

      // Nhánh dài L1 là găng: float = 0, critical = true
      expect(schedule['L1'].float).toBe(0);
      expect(schedule['L1'].critical).toBe(true);

      // Nhánh ngắn S1 không găng: float = 2 (đúng bằng chênh lệch), critical = false
      expect(schedule['S1'].float).toBe(2);
      expect(schedule['S1'].critical).toBe(false);

      expect(schedule['START'].critical).toBe(true);
      expect(schedule['END'].critical).toBe(true);
    });
  });
});

