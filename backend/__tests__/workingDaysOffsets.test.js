const { countWorkingDays } = require('../algorithms/workingDays');

describe('T-36: Convert Actual Dates to Offsets', () => {
  const calendar = {
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: false,
  };
  const holidays = ['2026-01-08'];

  test('Calculate offset over sunday (ca vắt chủ nhật)', () => {
    // Project starts on Friday 2026-01-09
    // Actual start date is Tuesday 2026-01-13
    // Friday(1), Saturday(2), Sunday(skip), Monday(3), Tuesday(4)
    // Offset = count - 1 = 3
    const projStart = '2026-01-09';
    const actualStart = '2026-01-13';
    
    const count = countWorkingDays(projStart, actualStart, calendar, []);
    const offset = count - 1;
    expect(offset).toBe(3);
  });

  test('Calculate offset over a holiday (ca có ngày lễ)', () => {
    // Project starts on Monday 2026-01-05
    // Holiday on Thursday 2026-01-08
    // Actual start date is Friday 2026-01-09
    // Monday(1), Tuesday(2), Wednesday(3), Thursday(skip), Friday(4)
    // Offset = count - 1 = 3
    const projStart = '2026-01-05';
    const actualStart = '2026-01-09';

    const count = countWorkingDays(projStart, actualStart, calendar, holidays);
    const offset = count - 1;
    expect(offset).toBe(3);
  });
  
  test('Calculate negative offset (before project start)', () => {
    // Actual start date is earlier than project start date
    // Project starts on Wednesday 2026-01-07
    // Actual start date is Monday 2026-01-05
    // count = 3. offset = -(count - 1) = -2
    const projStart = '2026-01-07';
    const actualStart = '2026-01-05';
    const count = countWorkingDays(actualStart, projStart, calendar, holidays);
    const offset = -(count - 1);
    expect(offset).toBe(-2);
  });
});
