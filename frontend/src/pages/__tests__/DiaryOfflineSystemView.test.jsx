import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import api from '../../lib/api';
import DiaryPage from '../DiaryPage';
import DiaryDayCard from '../../components/DiaryDayCard';
import DiaryWeekStrip from '../../components/DiaryWeekStrip';

vi.mock('../../lib/api');

const mockCategories = [
  { id: 101, name: 'Hạng mục Móng', code: 'W-01' },
];

describe('Offline Resilience across Diary components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentProjectId', '13');
  });

  it('DiaryDayCard: khi mất mạng không hiện hộp lỗi màu đỏ mà chuyển sang trạng thái trống thân thiện hoặc nạp cache', async () => {
    // Giả lập API lỗi do mất mạng
    api.get.mockRejectedValue(new Error('Network Error'));

    render(<DiaryDayCard projectId="13" date="2026-10-12" />);

    // Không được xuất hiện dòng chữ lỗi màu đỏ
    await waitFor(() => {
      expect(screen.queryByText('Không thể tải mục đầu ngày.')).not.toBeInTheDocument();
    });

    // Thay vào đó hiện trạng thái thân thiện Chưa ghi mục đầu ngày
    expect(screen.getByText('Chưa ghi mục đầu ngày')).toBeInTheDocument();
  });

  it('DiaryDayCard: nạp dữ liệu từ localStorage khi mất mạng', async () => {
    const cachedData = {
      exists: true,
      can_edit: true,
      day: {
        manpower_count: 25,
        weather_label: 'Nắng đẹp',
        updated_by_name: 'Kỹ sư Cục bộ',
        updated_at: '2026-10-12T08:00:00Z',
      },
      entries_count: 2,
    };
    localStorage.setItem('diary_day_13_2026-10-12', JSON.stringify(cachedData));

    api.get.mockRejectedValue(new Error('Network Error'));

    render(<DiaryDayCard projectId="13" date="2026-10-12" />);

    await waitFor(() => {
      expect(screen.getByText('25 người')).toBeInTheDocument();
      expect(screen.getByText('Nắng đẹp')).toBeInTheDocument();
    });
  });

  it('DiaryWeekStrip: giữ nguyên các ngày từ cache khi mất mạng', async () => {
    const cachedWeek = [
      { date: '2026-10-12', has_daily_log: true, manpower_count: 18, weather_label: 'Mưa rào' },
      { date: '2026-10-13', has_daily_log: false, entries_count: 0 }
    ];
    localStorage.setItem('diary_week_13_2026-10-12_2026-10-18', JSON.stringify(cachedWeek));

    api.get.mockRejectedValue(new Error('Network Error'));

    render(
      <DiaryWeekStrip
        projectId="13"
        selectedDate="2026-10-12"
        onSelectDate={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('18 người')).toBeInTheDocument();
      expect(screen.getByText('Mưa rào')).toBeInTheDocument();
    });
  });

  it('DiaryPage: khi gặp Network Error không hiển thị lỗi đỏ chặn danh sách mà hiển thị dữ liệu cache và thông báo ngoại tuyến', async () => {
    const cachedEntries = {
      data: [
        {
          id: 99,
          client_id: 'uuid-offline-cached-1',
          work_item_id: 101,
          work_item_name: 'Hạng mục Móng',
          content: 'Nội dung nhật ký được lưu từ trước',
          entry_at: '2026-10-12T09:00:00Z',
          entry_date: '2026-10-12',
          created_by_name: 'Kỹ sư Test',
        }
      ],
      total: 1
    };

    localStorage.setItem('diary_entries_cache_13_2026-10-12_', JSON.stringify(cachedEntries));
    localStorage.setItem('categories_13', JSON.stringify(mockCategories));

    api.get.mockImplementation((url) => {
      if (url.includes('/projects/13/diary-entries')) {
        return Promise.reject(new Error('Network Error'));
      }
      if (url.includes('/tree/all')) {
        return Promise.resolve({ data: mockCategories });
      }
      return Promise.reject(new Error('Network Error'));
    });

    render(
      <MemoryRouter>
        <DiaryPage user={{ id: 1, role: 'chi_huy_truong', name: 'Chỉ huy trưởng' }} />
      </MemoryRouter>
    );

    // Không được hiển thị màn hình lỗi đỏ Network Error
    await waitFor(() => {
      expect(screen.queryByText('Network Error')).not.toBeInTheDocument();
    });

    // Hiển thị nội dung nhật ký từ cache
    expect(await screen.findByText('Nội dung nhật ký được lưu từ trước')).toBeInTheDocument();
  });
});
