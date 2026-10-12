import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { format } from 'date-fns';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import api from '../../lib/api';
import DiaryPage from '../DiaryPage';
import DiaryEntryForm from '../../components/DiaryEntryForm';
import {
  openDiaryDB,
  closeDiaryDB,
  saveDiaryLog,
  getDiaryLogsByProject,
} from '../../lib/diaryDb';

vi.mock('../../lib/api');

const mockUser = { id: 1, role: 'ky_su_giam_sat', name: 'Kỹ sư Giám sát' };
const mockCategories = [
  { id: 101, name: 'Móng', code: 'W-01' },
  { id: 102, name: 'Thân', code: 'W-02' },
];

describe('T66 — Form ghi nhật ký khi mất mạng & Khôi phục dữ liệu', () => {
  const originalOnLine = navigator.onLine;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentProjectId', '13');

    // Mở lại DB sạch
    await closeDiaryDB();
    const db = await openDiaryDB();
    const tx = db.transaction(['diaryLogs', 'diaryAttachments'], 'readwrite');
    tx.objectStore('diaryLogs').clear();
    tx.objectStore('diaryAttachments').clear();
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });

    api.get.mockImplementation((url) => {
      if (url.includes('/projects/') && !url.includes('/diary-entries') && !url.includes('/diary-locks')) {
        return Promise.resolve({ data: { membership: 'ky_su_giam_sat' } });
      }
      if (url.includes('/tree/all')) {
        return Promise.resolve({ data: mockCategories });
      }
      if (url.includes('/diary-entries')) {
        return Promise.resolve({ data: { data: [], total: 0 } });
      }
      if (url.includes('/diary-locks/')) {
        return Promise.resolve({ data: { is_locked: false } });
      }
      return Promise.reject(new Error('not mocked'));
    });

    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-t66-stable-001' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(async () => {
    cleanup();
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    await closeDiaryDB();
  });

  it('1 & 10. Tạo nhật ký khi online: gọi API bình thường và không lưu pending', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    api.post.mockResolvedValueOnce({
      data: {
        entry: {
          id: 10,
          work_item_id: 101,
          content: 'Đổ bê tông online',
          client_id: 'uuid-t66-stable-001',
          entry_at: new Date().toISOString(),
          entry_date: format(new Date(), 'yyyy-MM-dd'),
          created_by_name: 'Kỹ sư Giám sát',
        },
      },
    });

    const handleSuccess = vi.fn();
    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={handleSuccess}
      />
    );

    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('category-dropdown'), { target: { value: '101' } });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: 'Đổ bê tông online' },
    });

    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/diary-entries'),
        expect.objectContaining({
          work_item_id: 101,
          content: 'Đổ bê tông online',
          client_id: 'uuid-t66-stable-001',
        })
      );
      expect(handleSuccess).toHaveBeenCalled();
    });
  });

  it('2, 3 & 4. Tạo nhật ký khi offline: lưu vào IndexedDB, không gọi API, hiện thông báo lưu cục bộ', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('category-dropdown'), { target: { value: '101' } });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: 'Kiểm tra cốt thép offline' },
    });

    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    // Không được gọi API khi offline
    expect(api.post).not.toHaveBeenCalled();

    // Hiển thị thông báo lưu trên thiết bị
    await waitFor(() => {
      expect(screen.getByText(/Đã lưu trên thiết bị — chờ đồng bộ/i)).toBeInTheDocument();
    });

    // Dữ liệu phải tồn tại trong IndexedDB với syncStatus = pending
    const offlineLogs = await getDiaryLogsByProject(13);
    expect(offlineLogs.length).toBe(1);
    expect(offlineLogs[0].content).toBe('Kiểm tra cốt thép offline');
    expect(offlineLogs[0].syncStatus).toBe('pending');
    expect(offlineLogs[0].client_id).toBe('uuid-t66-stable-001');
  });

  it('4 & 5. Khôi phục nhật ký sau khi reload / mở lại ứng dụng: hiển thị badge chờ đồng bộ', async () => {
    // Giả lập đã có bản ghi offline trong IndexedDB từ trước (do lưu khi mất mạng)
    const today = format(new Date(), 'yyyy-MM-dd');
    await saveDiaryLog({
      id: 'uuid-saved-earlier',
      client_id: 'uuid-saved-earlier',
      projectId: 13,
      work_item_id: 101,
      work_item_name: 'Móng',
      content: 'Nhật ký đã lưu trước khi reload ứng dụng',
      entry_at: new Date().toISOString(),
      entry_date: today,
      syncStatus: 'pending',
      created_by_name: 'Kỹ sư Offline',
    });

    // Mở trang DiaryPage
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <DiaryPage user={mockUser} />
      </MemoryRouter>
    );

    // Kiểm tra bản ghi offline được khôi phục thành công
    await waitFor(() => {
      expect(screen.getByText('Nhật ký đã lưu trước khi reload ứng dụng')).toBeInTheDocument();
    });

    // Có badge thể hiện rõ trạng thái cục bộ
    expect(screen.getByText(/Đã lưu trên thiết bị — chờ đồng bộ/i)).toBeInTheDocument();
  });

  it('6 & 7. Lỗi mạng khi API thất bại: lưu vào IndexedDB, giữ form và dùng lại cùng client_id khi thử lại', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    // Mock lỗi mạng từ Axios
    const netErr = new Error('Network Error');
    netErr.code = 'ERR_NETWORK';
    api.post.mockRejectedValueOnce(netErr);
    api.post.mockResolvedValueOnce({
      data: {
        id: 11,
        work_item_id: 101,
        content: 'Ghi nhật ký lúc mạng chập chờn',
        client_id: 'uuid-t66-stable-001',
        entry_at: new Date().toISOString(),
        entry_date: format(new Date(), 'yyyy-MM-dd'),
        created_by_name: 'Kỹ sư Giám sát',
      },
    });

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('category-dropdown'), { target: { value: '101' } });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: 'Ghi nhật ký lúc mạng chập chờn' },
    });

    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    // Giữ form trong lúc hàng đợi tự đồng bộ lại.
    expect(screen.getByDisplayValue('Ghi nhật ký lúc mạng chập chờn')).toBeInTheDocument();

    // Dữ liệu đã an toàn trong IndexedDB
    await waitFor(async () => {
      expect(await getDiaryLogsByProject(13)).toHaveLength(1);
    });
    const saved = await getDiaryLogsByProject(13);
    expect(saved.length).toBe(1);
    expect(saved[0].client_id).toBe('uuid-t66-stable-001');

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(api.post.mock.calls[0][1].client_id).toBe('uuid-t66-stable-001');
      expect(api.post.mock.calls[1][1].client_id).toBe('uuid-t66-stable-001');
      expect(screen.getByText(/đã được đồng bộ thành công/i)).toBeInTheDocument();
    });
  });

  it('9. Phân biệt lỗi phân quyền (403) và không chuyển thành lưu offline hợp lệ', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const authErr = new Error('Forbidden');
    authErr.response = { status: 403, data: { message: 'Bạn không có quyền ghi nhật ký.' } };
    api.post.mockRejectedValueOnce(authErr);

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('category-dropdown'), { target: { value: '101' } });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: 'Thử ghi nhật ký khi không có quyền' },
    });

    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    await waitFor(() => {
      expect(screen.getByText('Bạn không có quyền ghi nhật ký.')).toBeInTheDocument();
    });

    // Không được lưu vào IndexedDB dưới dạng offline log
    const saved = await getDiaryLogsByProject(13);
    expect(saved.length).toBe(0);
  });
});
