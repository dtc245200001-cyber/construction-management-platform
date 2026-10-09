import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import api from '../../lib/api';
import FieldPage from '../FieldPage';

vi.mock('../../lib/api');

// S-26 / T-59 (bổ sung) — Tests cho toggle "Theo đội / Tất cả đội"
// dành cho chỉ huy trưởng / ban quản lý trên FieldPage.
//
// Vai trò dùng để quyết định isTeamLeader là MEMBERSHIP TRONG DỰ ÁN
// (GET /projects/:id → membership), không phải user.role toàn cục —
// FieldPage không còn nhận prop `user` nữa.

const teamsResponse = {
  teams: [
    { id: 10, name: 'Doi A' },
    { id: 20, name: 'Doi B' },
  ],
};

const allTeamsTasksResponse = {
  week: { start: '2026-09-14', end: '2026-09-20', report_date: '2026-09-16' },
  tasks: [
    {
      task_id: 101,
      name: 'Việc của đội A',
      work_item_name: 'WI A',
      team_id: 10,
      team_name: 'Doi A',
      early_start: '2026-09-15',
      is_critical: true,
      planned_quantity: null,
      quantity_unit: null,
      reported_today: '0',
      cumulative_reported: '0',
      over_planned: false,
    },
    {
      task_id: 102,
      name: 'Việc của đội B',
      work_item_name: 'WI B',
      team_id: 20,
      team_name: 'Doi B',
      early_start: '2026-09-16',
      is_critical: false,
      planned_quantity: null,
      quantity_unit: null,
      reported_today: '0',
      cumulative_reported: '0',
      over_planned: false,
    },
  ],
};

const myTeamTasksResponse = {
  team: { id: 10, name: 'Doi A' },
  week: { start: '2026-09-14', end: '2026-09-20', report_date: '2026-09-16' },
  tasks: [
    {
      task_id: 101,
      name: 'Việc của đội A',
      work_item_name: 'WI A',
      team_id: 10,
      team_name: 'Doi A',
      early_start: '2026-09-15',
      is_critical: true,
      planned_quantity: null,
      quantity_unit: null,
      reported_today: '0',
      cumulative_reported: '0',
      over_planned: false,
    },
  ],
};

function mockApiFor(membership) {
  api.get.mockImplementation((url) => {
    if (url === '/projects/13') {
      return Promise.resolve({ data: { membership } });
    }
    if (url.includes('/teams/all/tasks')) {
      return Promise.resolve({ data: allTeamsTasksResponse });
    }
    if (url.includes('/my-team/tasks')) {
      return Promise.resolve({ data: myTeamTasksResponse });
    }
    if (url.endsWith('/teams')) {
      return Promise.resolve({ data: teamsResponse });
    }
    return Promise.reject(new Error('not mocked: ' + url));
  });
}

describe('FieldPage (S-26 / T-59)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('currentProjectId', '13');
  });

  it('chỉ huy trưởng: mặc định ở chế độ "Theo đội", phải chọn đội mới thấy việc', async () => {
    mockApiFor('chi_huy_truong');
    render(<FieldPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Vui lòng chọn đội để xem công việc.')
      ).toBeInTheDocument();
    });

    expect(api.get).not.toHaveBeenCalledWith(
      expect.stringContaining('/teams/all/tasks'),
      expect.anything()
    );
  });

  it('chỉ huy trưởng bấm "Tất cả đội" → gọi /teams/all/tasks, không cần chọn đội', async () => {
    mockApiFor('chi_huy_truong');
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText('Tất cả đội')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tất cả đội'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/projects/13/teams/all/tasks',
        expect.objectContaining({
          params: expect.objectContaining({
            week_start: expect.any(String),
            week_end: expect.any(String),
            report_date: expect.any(String),
          }),
        })
      );
    });

    expect(await screen.findByText('Việc của đội A')).toBeInTheDocument();
    expect(screen.getByText('Việc của đội B')).toBeInTheDocument();
  });

  it('ban quản lý cũng thấy toggle "Tất cả đội" (không chỉ chỉ huy trưởng)', async () => {
    mockApiFor('ban_quan_ly');
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText('Tất cả đội')).toBeInTheDocument();
    });
  });

  it('view "Tất cả đội" hiện badge tên đội trên từng việc, không hiện ô báo cáo', async () => {
    mockApiFor('chi_huy_truong');
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText('Tất cả đội')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tất cả đội'));

    await screen.findByText('Việc của đội A');

    // Badge tên đội xuất hiện cho từng task.
    expect(screen.getByText('Doi A')).toBeInTheDocument();
    expect(screen.getByText('Doi B')).toBeInTheDocument();

    // Không có ô nhập khối lượng / nút Lưu ở view chỉ đọc này.
    expect(
      screen.queryByText('Khối lượng hoàn thành hôm nay')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
  });

  it('chuyển lại "Theo đội" sau khi đã xem tất cả đội → về yêu cầu chọn đội', async () => {
    mockApiFor('chi_huy_truong');
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText('Tất cả đội')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tất cả đội'));
    await screen.findByText('Việc của đội A');

    fireEvent.click(screen.getByText('Theo đội'));

    await waitFor(() => {
      expect(
        screen.getByText('Vui lòng chọn đội để xem công việc.')
      ).toBeInTheDocument();
    });
  });

  it('đội trưởng (theo membership dự án): không có toggle, gọi /my-team/tasks trực tiếp', async () => {
    mockApiFor('doi_truong');
    render(<FieldPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/projects/13/my-team/tasks',
        expect.anything()
      );
    });

    expect(screen.queryByText('Tất cả đội')).not.toBeInTheDocument();
    expect(screen.queryByText('Theo đội')).not.toBeInTheDocument();

    // Đội trưởng vẫn thấy ô báo cáo khối lượng (không bị ẩn).
    expect(
      await screen.findByText('Khối lượng hoàn thành hôm nay')
    ).toBeInTheDocument();
  });

  it('việc găng vẫn có badge "Việc găng" ở view tất cả đội', async () => {
    mockApiFor('chi_huy_truong');
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText('Tất cả đội')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tất cả đội'));
    await screen.findByText('Việc của đội A');

    const cardA = screen.getByText('Việc của đội A').closest('article');
    expect(within(cardA).getByText('Việc găng')).toBeInTheDocument();
  });

  it('membership khác nhau theo dự án: role toàn cục không ảnh hưởng — chỉ membership mới quyết định', async () => {
    // Mô phỏng chính xác bug đã phát hiện: tài khoản có thể có vai trò
    // toàn cục khác với vai trò trong dự án hiện tại. FieldPage phải
    // theo đúng membership (chi_huy_truong) để hiện toggle, bất kể
    // user.role toàn cục là gì.
    mockApiFor('chi_huy_truong');
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText('Tất cả đội')).toBeInTheDocument();
    });
  });
});
