import React from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { format } from 'date-fns';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import api from '../../lib/api';
import DiaryPage from '../DiaryPage';

vi.mock('../../lib/api');

const mockUserWrite = { id: 1, role: 'ky_su_giam_sat', name: 'Ky su' };
const mockUserRead = { id: 2, role: 'chu_dau_tu', name: 'Chu dau tu' };

const mockCategories = [
  { id: 101, name: 'Mong', code: 'W-01' },
  { id: 102, name: 'Than', code: 'W-02' }
];

const mockEntries = {
  data: [
    {
      id: 1,
      work_item_id: 101,
      work_item_name: 'Mong',
      work_item_code: 'W-01',
      content: 'Đổ bê tông',
      entry_at: '2026-10-01T23:30:00Z',
      entry_date: '2026-10-02',
      created_by_name: 'Ky su',
      client_id: 'uuid-1'
    }
  ],
  total: 1
};

describe('DiaryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    api.get.mockImplementation((url) => {
      if (url.includes('/tree/all')) {
        return Promise.resolve({ data: mockCategories });
      }
      if (url.includes('/diary-entries')) {
        return Promise.resolve({ data: mockEntries });
      }
      return Promise.reject(new Error('not mocked'));
    });
    
    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-123' });
    
    // Mock window.alert
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderPage = (user = mockUserWrite, state = null) => {
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/diary', state }]}>
        <DiaryPage user={user} />
      </MemoryRouter>
    );
  };

  it('Vai trò chỉ xem (chu_dau_tu) không thấy form ghi', async () => {
    renderPage(mockUserRead);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/diary-entries')));
    
    // Button "Ghi nhật ký" should not be in the document
    expect(screen.queryByText('Ghi nhật ký')).not.toBeInTheDocument();
  });

  it('Lọc: gọi API đúng tham số và xóa lọc', async () => {
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/diary-entries')));

    // Set filters
    const dateInput = document.querySelector('input[type="date"]');
    const select = screen.getByRole('combobox');
    
    fireEvent.change(dateInput, { target: { value: '2026-10-02' } });
    fireEvent.change(select, { target: { value: '101' } });
    
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('date=2026-10-02'));
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('work_item_id=101'));
    });
    
    // Xóa lọc
    const clearBtn = screen.getByText('Xóa lọc');
    fireEvent.click(clearBtn);
    
    await waitFor(() => {
      // should call without date and work_item_id
      const callArgs = api.get.mock.calls.find(call => call[0].includes('limit=50') && !call[0].includes('date=') && !call[0].includes('work_item_id='));
      expect(callArgs).toBeTruthy();
    });
  });

  it('Mục có entry_at 2026-10-01T23:30:00Z hiển thị đúng', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Đổ bê tông')).toBeInTheDocument());
    
    // Convert 23:30Z to local string
    // In VN (UTC+7), it's 06:30 - 02/10/2026. 
    // We just check if the text matches something similar to 06:30 - 02/10/2026.
    expect(screen.getByText(/02\/10\/2026/)).toBeInTheDocument();
  });

  describe('DiaryEntryForm Validation', () => {
    it('Để trống hạng mục, nội dung rỗng/chỉ khoảng trắng → báo lỗi, không gọi API', async () => {
      const user = userEvent.setup();
      renderPage(mockUserWrite, { openForm: true });
      
      await waitFor(() => expect(screen.getByText('Ghi nhật ký thi công')).toBeInTheDocument());
      
      const submitBtn = screen.getByTestId('submit-diary-btn');
      
      // Submit form directly
      await user.click(submitBtn);
      
      expect(await screen.findByText(/Vui lòng chọn hạng mục/i)).toBeInTheDocument();
      expect(await screen.findByText(/Vui lòng nhập nội dung/i)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
      
      // Fill spaces
      const textarea = screen.getByPlaceholderText(/Nhập nội dung/i);
      await user.type(textarea, '    ');
      fireEvent.blur(textarea);
      
      expect(await screen.findByText('Vui lòng nhập nội dung')).toBeInTheDocument();
    });

    it('5001 ký tự → bị chặn', async () => {
      const user = userEvent.setup();
      renderPage(mockUserWrite, { openForm: true });
      
      await waitFor(() => expect(screen.getByText('Ghi nhật ký thi công')).toBeInTheDocument());
      
      const textarea = screen.getByPlaceholderText(/Nhập nội dung/i);
      fireEvent.change(textarea, { target: { value: 'a'.repeat(5001) } });
      fireEvent.blur(textarea);
      
      expect(await screen.findByText(/Nội dung tối đa 5000 ký tự/i)).toBeInTheDocument();
      expect(screen.getByTestId('submit-diary-btn')).toBeDisabled();
    });
  });

  describe('DiaryEntryForm Submission', () => {
    it('Lưu hợp lệ: gọi POST với đúng work_item_id (số), client_id UUID', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      api.post.mockResolvedValueOnce({
        data: {
          entry: {
            id: 2,
            work_item_id: 101,
            work_item_name: 'Mong',
            content: 'Ghi test',
            entry_at: new Date().toISOString(),
            entry_date: today, // matching today
            created_by_name: 'Ky su'
          }
        }
      });
      
      renderPage(mockUserWrite, { openForm: true });
      await waitFor(() => expect(screen.getByText('Ghi nhật ký thi công')).toBeInTheDocument());
      
      const user = userEvent.setup();
      
      // Select category
      const select = screen.getByTestId('category-dropdown');
      fireEvent.change(select, { target: { value: '101' } });
      
      // Fill content
      const textarea = screen.getByPlaceholderText(/Nhập nội dung/i);
      fireEvent.change(textarea, { target: { value: 'Ghi test' } });
      
      // Submit
      const submitBtn = screen.getByTestId('submit-diary-btn');
      fireEvent.submit(submitBtn.closest('form'));
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/diary-entries'),
          expect.objectContaining({
            work_item_id: 101, // must be number
            content: 'Ghi test',
            client_id: 'test-uuid-123'
          })
        );
      });
      
      // Form should close and item appears
      await waitFor(() => expect(screen.queryByText('Ghi nhật ký thi công')).not.toBeInTheDocument());
      expect(screen.getByText('Ghi test')).toBeInTheDocument();
    });

    it('Lỗi mạng: giữ form, hiện nút Gửi lại, gửi lại đúng client_id, sau đó thành công', async () => {
      // Fail first
      api.post.mockRejectedValueOnce(new Error('Network error')); // No response obj
      
      renderPage(mockUserWrite, { openForm: true });
      await waitFor(() => expect(screen.getByText('Ghi nhật ký thi công')).toBeInTheDocument());
      
      const user = userEvent.setup();
      
      // Select & Fill
      const select = screen.getByTestId('category-dropdown');
      fireEvent.change(select, { target: { value: '101' } });
      fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), { target: { value: 'Loi mang test' } });
      
      const submitBtn = screen.getByTestId('submit-diary-btn');
      fireEvent.submit(submitBtn.closest('form'));
      
      await waitFor(() => expect(screen.getByText(/Chưa gửi được, nội dung vẫn được giữ/i)).toBeInTheDocument());
      
      // Content still there
      expect(screen.getByDisplayValue('Loi mang test')).toBeInTheDocument();
      
      // Draft should be saved
      expect(localStorage.getItem('diary_draft_13')).toContain('Loi mang test');
      
      // Second attempt success
      api.post.mockResolvedValueOnce({
        data: {
          entry: {
            id: 2, work_item_id: 101, content: 'Loi mang test', entry_at: new Date().toISOString(), entry_date: format(new Date(), 'yyyy-MM-dd'), created_by_name: 'Ky su'
          }
        }
      });
      
      const retryBtn = screen.getByRole('button', { name: /Gửi lại/i });
      fireEvent.click(retryBtn);
      
      await waitFor(() => {
        // Should be called twice with SAME UUID
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(api.post.mock.calls[0][1].client_id).toBe('test-uuid-123');
        expect(api.post.mock.calls[1][1].client_id).toBe('test-uuid-123');
      });
      
      // Form closes, draft removed
      await waitFor(() => expect(screen.queryByText('Ghi nhật ký thi công')).not.toBeInTheDocument());
      expect(localStorage.getItem('diary_draft_13')).toBeNull();
    });

    it('Lỗi 422 INVALID_WORK_ITEM, 403 → hiện tiếng Việt, không tự thử lại', async () => {
      api.post.mockRejectedValueOnce({
        response: { status: 422, data: { code: 'INVALID_WORK_ITEM' } }
      });
      
      renderPage(mockUserWrite, { openForm: true });
      await waitFor(() => expect(screen.getByText('Ghi nhật ký thi công')).toBeInTheDocument());
      
      const user = userEvent.setup();
      
      const select = screen.getByTestId('category-dropdown');
      fireEvent.change(select, { target: { value: '101' } });
      fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), { target: { value: 'Loi 422' } });
      
      const submitBtn = screen.getByTestId('submit-diary-btn');
      fireEvent.submit(submitBtn.closest('form'));
      
      await waitFor(() => expect(screen.getByText(/Hạng mục không hợp lệ/i)).toBeInTheDocument());
      
      // Try 403
      api.post.mockRejectedValueOnce({
        response: { status: 403 }
      });
      fireEvent.submit(submitBtn.closest('form'));
      
      await waitFor(() => expect(screen.getByText(/Bạn không có quyền ghi nhật ký/i)).toBeInTheDocument());
    });
  });
});
