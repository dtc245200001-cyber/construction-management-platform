import { describe, it, expect } from 'vitest';
import { dateToX, mapScheduleToGantt, generateTimelineTicks } from '../ganttUtils';

describe('ganttUtils', () => {
  describe('dateToX', () => {
    it('Mốc 1: date = 02/10/2026 (ngày đầu) -> x = 0', () => {
      const startDate = '2026-10-02';
      const date = '2026-10-02';
      const pixelsPerDay = 20;
      expect(dateToX(date, startDate, pixelsPerDay)).toBe(0);
    });

    it('Mốc 2: date = 12/10/2026 (10 ngày sau) -> x = 200', () => {
      const startDate = '2026-10-02';
      const date = '2026-10-12';
      const pixelsPerDay = 20;
      expect(dateToX(date, startDate, pixelsPerDay)).toBe(200);
    });

    it('Mốc 3: date = 01/11/2026 (30 ngày sau) -> x = 600', () => {
      const startDate = '2026-10-02';
      const date = '2026-11-01';
      const pixelsPerDay = 20;
      expect(dateToX(date, startDate, pixelsPerDay)).toBe(600);
    });
  });

  describe('mapScheduleToGantt', () => {
    it('map mảng API task sang tọa độ vẽ Gantt', () => {
      const mockTasks = [
        { id: 1, name: 'Task 1', early_start: '2026-10-02', early_finish: '2026-10-03', is_critical: true },
        { id: 2, name: 'Task 2', early_start: '2026-10-04', early_finish: '2026-10-04', is_critical: false }
      ];
      
      const res = mapScheduleToGantt(mockTasks, '2026-10-02', 20, 40);
      
      expect(res).toHaveLength(2);
      
      // Task 1: 02/10 -> 03/10 (2 days). x = 0, width = 40. y = 0
      expect(res[0].x).toBe(0);
      expect(res[0].y).toBe(0);
      expect(res[0].width).toBe(40);
      expect(res[0].height).toBe(24); // 40 * 0.6
      
      // Task 2: 04/10 (diff 2 days from 02/10). x = 40. width = 1 day (20px). y = 40
      expect(res[1].x).toBe(40);
      expect(res[1].y).toBe(40);
      expect(res[1].width).toBe(20);
    });

    it('loại bỏ các task thiếu ngày', () => {
      const res = mapScheduleToGantt([{ id: 1, early_start: null, early_finish: null }], '2026-10-02', 20);
      expect(res).toHaveLength(0);
    });
  });

  describe('generateTimelineTicks', () => {
    it('chế độ ngày: sinh đủ số ngày', () => {
      const ticks = generateTimelineTicks('2026-10-02', 10, 'day', 20);
      expect(ticks).toHaveLength(11); // 0 đến 10 là 11 mốc
      expect(ticks[0].label).toBe('02/10/2026');
      expect(ticks[0].x).toBe(0);
      expect(ticks[10].label).toBe('12/10/2026');
      expect(ticks[10].x).toBe(200);
    });

    it('chế độ tuần: sinh các mốc mỗi 7 ngày', () => {
      const ticks = generateTimelineTicks('2026-10-02', 30, 'week', 5); // pixelsPerDay = 5
      // 30 ngày / 7 = 4, cộng mốc 0 là 5 mốc (0, 7, 14, 21, 28)
      expect(ticks).toHaveLength(5);
      expect(ticks[0].label).toContain('T1');
      expect(ticks[0].x).toBe(0);
      expect(ticks[1].label).toContain('T2');
      expect(ticks[1].x).toBe(35); // 7 * 5
    });
  });
});
