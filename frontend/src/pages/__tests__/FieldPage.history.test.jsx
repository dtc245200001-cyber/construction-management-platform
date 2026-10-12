import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import api from '../../lib/api';
import FieldPage from '../FieldPage';

vi.mock('../../lib/api');

const mockUser = { id: 1, role: 'doi_truong', name: 'Doi Truong' };

const mockTasks = [
  {
    task_id: 10,
    name: 'Dao dat mong',
    work_item_name: 'Hang muc A',
    planned_quantity: '100',
    quantity_unit: 'm3',
    reported_today: '10.5',
    cumulative_reported: '10.5',
    over_planned: false,
    early_start: '2026-10-01',
    last_reported_at: '2026-10-05T08:00:00Z',
  },
];

const mockHistory = {
  history: [
    {
      id: 1,
      quantity: '10.5',
      report_date: '2026-10-05',
      created_at: '2026-10-05T08:00:00Z',
      reported_by: 1,
      reported_by_name: 'Doi Truong',
      team_id: 2,
      team_name: 'Doi 1',
      audit_id: 7,
      audit_action: 'CREATE_QUANTITY_REPORT',
      audit_created_at: '2026-10-05T08:00:01Z',
      audit_ip_address: '127.0.0.1',
      audit_user_name: 'Doi Truong',
    },
    {
      id: 2,
      quantity: '5',
      report_date: '2026-09-01',
      created_at: '2026-09-01T08:00:00Z',
      reported_by: 1,
      reported_by_name: 'Doi Truong',
      team_id: 2,
      team_name: 'Doi 1',
      audit_id: null,
      audit_action: null,
      audit_created_at: null,
      audit_ip_address: null,
      audit_user_name: null,
    },
  ],
};

describe('FieldPage — S-39 lich su thao tac (T-104)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentProjectId', '1');

    api.get.mockImplementation((url) => {
      // S-39: FieldPage trên main giờ lấy membership trước khi load task —
      // mock đúng response này để component vượt qua guard projectRole.
      if (/^\/projects\/\d+$/.test(url)) {
        return Promise.resolve({ data: { membership: 'doi_truong' } });
      }
      if (url.includes('/quantity-reports/history')) {
        return Promise.resolve({ data: mockHistory });
      }
      if (url.includes('/my-team/tasks')) {
        return Promise.resolve({ data: { team: { id: 2, name: 'Doi 1' }, tasks: mockTasks } });
      }
      if (url.includes('/teams')) {
        return Promise.resolve({ data: { teams: [] } });
      }
      return Promise.reject(new Error(`not mocked: ${url}`));
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={[{ pathname: '/field' }]}>
        <FieldPage user={mockUser} />
      </MemoryRouter>
    );

  it('Nut "Lich su bao cao" goi endpoint history moi (ke thua audit)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Dao dat mong')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Lịch sử báo cáo'));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/10/quantity-reports/history')
      )
    );
  });

  it('Modal hien thi cot "Nhat ky thao tac" voi ten nguoi lap', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Dao dat mong')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Lịch sử báo cáo'));

    await waitFor(() =>
      expect(screen.getByText('Nhật ký thao tác')).toBeInTheDocument()
    );
    expect(screen.getAllByText('Doi Truong').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/đã lập/)).toBeInTheDocument();
  });

  it('Bao cao cu (truoc S-39, khong co audit) hien thi chu thich thay vi crash', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Dao dat mong')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Lịch sử báo cáo'));

    await waitFor(() =>
      expect(screen.getByText(/Báo cáo cũ \(trước/)).toBeInTheDocument()
    );
  });
});
