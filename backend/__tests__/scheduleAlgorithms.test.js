const {
  calculateFS,
  calculateSS,
  calculateFF,
  calculateSF,
  forwardPass,
} = require('../utils/scheduleAlgorithms');

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
