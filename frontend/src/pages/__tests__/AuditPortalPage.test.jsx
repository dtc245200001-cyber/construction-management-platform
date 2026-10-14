import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import api from '../../lib/api';
import AuditPortalPage from '../AuditPortalPage';

vi.mock('../../lib/api');
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('currentProjectId', '12');
});
afterEach(cleanup);

test('owner sees before/after details and filters the complete Vietnam calendar day', async () => {
  api.get.mockImplementation(async (url) => ({ data: url === '/projects/12'
    ? { membership: 'chu_dau_tu' }
    : { total: 1, logs: [{ id: 1, action: 'LOCK_DIARY', details: { old_value: { is_locked: false }, new_value: { is_locked: true } } }] } }));
  render(<AuditPortalPage user={{ id: 7 }} />);
  fireEvent.click(await screen.findByText('Khóa sổ nhật ký'));
  expect(screen.getByText('Trước')).toBeInTheDocument();
  expect(screen.getByText('Sau')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-14' } });
  fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-14' } });
  await waitFor(() => {
    const url = api.get.mock.calls.at(-1)[0];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('from')).toBe('2026-10-13T17:00:00.000Z');
    expect(params.get('to')).toBe('2026-10-14T16:59:59.999Z');
  });
});

test('team leader cannot request project audit logs', async () => {
  api.get.mockResolvedValue({ data: { membership: 'doi_truong' } });
  render(<AuditPortalPage user={{ id: 7 }} />);
  await waitFor(() => expect(screen.queryByText('Đang kiểm tra quyền truy cập...')).not.toBeInTheDocument());
  expect(api.get.mock.calls).toEqual([['/projects/12']]);
});
