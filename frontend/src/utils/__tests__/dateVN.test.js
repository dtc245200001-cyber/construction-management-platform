import { describe, it, expect } from 'vitest';
import {
  todayVN,
  addDays,
  startOfWeek,
  weekDays,
  formatDayVN,
  formatShortDayVN,
  formatDateVN,
} from '../dateVN';

// S-22 / T-51 — Tests cho helper ngày giờ Việt Nam dùng ở dải tuần.

describe('dateVN (S-22 / T-51)', () => {
  it('todayVN khớp giờ Việt Nam, định dạng YYYY-MM-DD', () => {
    const expected = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(todayVN()).toBe(expected);
    expect(todayVN()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe('addDays', () => {
    it('cộng/trừ ngày thường', () => {
      expect(addDays('2026-10-09', 1)).toBe('2026-10-10');
      expect(addDays('2026-10-09', -1)).toBe('2026-10-08');
      expect(addDays('2026-10-09', 0)).toBe('2026-10-09');
    });

    it('qua tháng và qua năm', () => {
      expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
  });

  describe('startOfWeek / weekDays', () => {
    it('Thứ Sáu 09/10/2026 → Thứ Hai 05/10/2026', () => {
      expect(startOfWeek('2026-10-09')).toBe('2026-10-05');
    });

    it('Chủ nhật 11/10/2026 → Thứ Hai 05/10/2026', () => {
      expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    });

    it('Thứ Hai giữ nguyên', () => {
      expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
    });

    it('weekDays trả đúng 7 ngày T2–CN', () => {
      expect(weekDays('2026-10-09')).toEqual([
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
        '2026-10-08',
        '2026-10-09',
        '2026-10-10',
        '2026-10-11',
      ]);
    });
  });

  describe('format', () => {
    it('formatShortDayVN: T2, T6, CN', () => {
      expect(formatShortDayVN('2026-10-05')).toBe('T2 05/10');
      expect(formatShortDayVN('2026-10-09')).toBe('T6 09/10');
      expect(formatShortDayVN('2026-10-11')).toBe('CN 11/10');
    });

    it('formatDayVN chứa thứ và ngày VN', () => {
      const s = formatDayVN('2026-10-09');
      expect(s).toContain('09/10/2026');
      expect(s).toMatch(/Thứ/);
    });
  });

  // S-25 — hiển thị khoảng chồng lịch, không qua Date nên không lệch múi giờ
  describe('formatDateVN', () => {
    it('đổi YYYY-MM-DD sang DD/MM/YYYY', () => {
      expect(formatDateVN('2026-10-15')).toBe('15/10/2026');
    });

    it('bỏ phần giờ phía sau', () => {
      expect(formatDateVN('2026-10-15T00:00:00.000Z')).toBe('15/10/2026');
    });

    it('rỗng → chuỗi rỗng, sai định dạng → giữ nguyên', () => {
      expect(formatDateVN(null)).toBe('');
      expect(formatDateVN('abc')).toBe('abc');
    });
  });
});
