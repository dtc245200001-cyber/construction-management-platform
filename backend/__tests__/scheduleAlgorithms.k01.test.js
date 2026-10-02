const k01 = require('./fixtures/k01-expected.json');

const {
  calculateSchedule,
} = require('../utils/scheduleAlgorithms');

describe('T-22: K-01 automated acceptance tests', () => {
  test('K-01 fixture records who calculated it and when', () => {
    expect(k01.metadata.source).toBe('K-01');
    expect(k01.metadata.calculatedBy).toBeTruthy();
    expect(k01.metadata.calculatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('K-01 contains exactly 10 tasks', () => {
    expect(k01.tasks).toHaveLength(10);
    expect(k01.expected).toHaveLength(10);
  });

  const result = calculateSchedule(
    k01.tasks,
    k01.dependencies,
    k01.topologicalOrder,
    k01.projectStart
  );

  test.each(k01.expected)(
    'Task $id matches K-01: ES=$ES EF=$EF LS=$LS LF=$LF critical=$critical',
    (expected) => {
      const actual = result[expected.id];

      expect(actual).toBeDefined();
      expect(actual.ES).toBe(expected.ES);
      expect(actual.EF).toBe(expected.EF);
      expect(actual.LS).toBe(expected.LS);
      expect(actual.LF).toBe(expected.LF);
      expect(actual.critical).toBe(expected.critical);
    }
  );

  test('critical path matches the hand-calculated K-01 answer', () => {
    const criticalPath = k01.topologicalOrder.filter(
      (id) => result[id].critical
    );

    expect(criticalPath).toEqual(k01.criticalPath);
  });
});
