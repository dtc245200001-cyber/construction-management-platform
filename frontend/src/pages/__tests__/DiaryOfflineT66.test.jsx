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
  createDiaryEntry,
  saveDiaryLog,
  getDiaryLogsByProject,
  getDiaryAttachmentsByLog,
  updateDiaryEntry,
} from '../../lib/diaryDb';
import * as diaryDbModule from '../../lib/diaryDb';
import * as diarySyncModule from '../../services/diarySync';

vi.mock('../../lib/api');

const mockUser = { id: 1, role: 'ky_su_giam_sat', name: 'Kỹ sư Giám sát' };
const mockCategories = [
  { id: 101, name: 'Móng', code: 'W-01' },
  { id: 102, name: 'Thân', code: 'W-02' },
];
const originalCreateObjectURL = URL.createObjectURL;

function failStorePutOnce(db, storeName, error) {
  const originalTransaction = db.transaction.bind(db);
  let shouldFail = true;
  vi.spyOn(db, 'transaction').mockImplementation((stores, mode, options) => {
    const transaction = originalTransaction(stores, mode, options);
    const requestedStores = Array.isArray(stores) ? stores : [stores];
    if (
      !shouldFail ||
      mode !== 'readwrite' ||
      !requestedStores.includes(storeName)
    ) {
      return transaction;
    }
    shouldFail = false;
    return new Proxy(transaction, {
      get(target, property) {
        if (property === 'objectStore') {
          return (name) => {
            const store = target.objectStore(name);
            if (name !== storeName) return store;
            return new Proxy(store, {
              get(targetStore, storeProperty) {
                if (storeProperty === 'put') {
                  return () => {
                    throw error;
                  };
                }
                const value = Reflect.get(targetStore, storeProperty, targetStore);
                return typeof value === 'function' ? value.bind(targetStore) : value;
              },
            });
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
}

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
    if (originalCreateObjectURL) {
      URL.createObjectURL = originalCreateObjectURL;
    } else {
      delete URL.createObjectURL;
    }
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

  it('T68.1. Tạo liên tiếp nhiều nhật ký offline không ghi đè bản ghi trước', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-t68-${++nextId}` });

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());

    for (const [index, content] of [
      'Nhật ký offline thứ nhất',
      'Nhật ký offline thứ hai',
    ].entries()) {
      fireEvent.change(screen.getByTestId('category-dropdown'), {
        target: { value: index === 0 ? '101' : '102' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
        target: { value: content },
      });
      fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));
      await waitFor(() => expect(screen.getByPlaceholderText(/Nhập nội dung/i)).toHaveValue(''));
    }

    const saved = await getDiaryLogsByProject(13);
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((entry) => entry.clientId)).size).toBe(2);
    expect(saved.map((entry) => entry.content)).toEqual(
      expect.arrayContaining([
        'Nhật ký offline thứ nhất',
        'Nhật ký offline thứ hai',
      ])
    );
    expect(saved.every((entry) => entry.syncStatus === 'pending')).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(/Đã lưu trên thiết bị — chờ đồng bộ/i)).toBeInTheDocument();

    const unrelatedId = 'uuid-t68-unrelated';
    await createDiaryEntry({
      id: unrelatedId,
      projectId: 13,
      work_item_id: 101,
      content: 'Nhật ký của một form khác',
      syncStatus: 'failed',
    });
    await updateDiaryEntry(saved[0].clientId, {
      syncStatus: 'synced',
      serverId: 801,
    });
    window.dispatchEvent(new Event('diary-sync-updated'));
    await waitFor(() => {
      expect(screen.getByText(/Đã lưu trên thiết bị — chờ đồng bộ/i)).toBeInTheDocument();
    });
    await updateDiaryEntry(saved[1].clientId, {
      syncStatus: 'synced',
      serverId: 802,
    });
    window.dispatchEvent(new Event('diary-sync-updated'));
    await waitFor(() => {
      expect(screen.getByText(/đã được đồng bộ thành công/i)).toBeInTheDocument();
    });

    await closeDiaryDB();
    const reloaded = await getDiaryLogsByProject(13);
    expect(reloaded.map((entry) => entry.content)).toEqual(
      expect.arrayContaining([
        'Nhật ký offline thứ nhất',
        'Nhật ký offline thứ hai',
      ])
    );
  });

  it('T68.6. Nếu đọc lại trạng thái thất bại sau khi lưu, không khẳng định pending hoặc synced', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const originalGetEntry = diaryDbModule.getDiaryEntryById;
    const readSpy = vi.spyOn(diaryDbModule, 'getDiaryEntryById').mockImplementation(async (id) => {
      if (id === 'uuid-t66-stable-001') {
        throw new Error('IndexedDB read failed');
      }
      return originalGetEntry(id);
    });

    const { unmount } = render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('category-dropdown'), {
      target: { value: '101' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: 'Lưu thành công nhưng không đọc lại được' },
    });
    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/chưa xác nhận được trạng thái đồng bộ/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/đã được đồng bộ thành công/i)).not.toBeInTheDocument();
    expect(await getDiaryLogsByProject(13)).toHaveLength(1);
    readSpy.mockRestore();
    unmount();
    await updateDiaryEntry('uuid-t66-stable-001', {
      syncStatus: 'synced',
      serverId: 899,
    });
    expect(() => window.dispatchEvent(new Event('diary-sync-updated'))).not.toThrow();
  });

  it('T68.3/6. Lỗi đọc lại sau khi lưu nhật ký và ảnh không báo đồng bộ thành công', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/t68-readback-image');
    api.post.mockResolvedValueOnce({
      data: {
        entry: {
          id: 711,
          work_item_id: 101,
          content: 'Nhật ký đã lưu cùng ảnh',
          client_id: 'uuid-t66-stable-001',
          entry_at: new Date().toISOString(),
        },
      },
    });
    const syncSpy = vi.spyOn(diarySyncModule, 'requestDiarySync').mockResolvedValueOnce(0);
    const readSpy = vi
      .spyOn(diaryDbModule, 'getDiaryEntryWithImages')
      .mockRejectedValueOnce(new Error('IndexedDB read failed'));
    const onSuccess = vi.fn();

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );
    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('category-dropdown'), {
      target: { value: '101' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: 'Nhật ký đã lưu cùng ảnh' },
    });
    fireEvent.change(screen.getByTestId('diary-image-input'), {
      target: {
        files: [new File(['saved-photo'], 'saved-photo.jpg', { type: 'image/jpeg' })],
      },
    });
    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess.mock.calls[0][0]).toMatchObject({
      id: 711,
      syncStatus: 'pending',
      isOffline: true,
    });
    expect(screen.getByText(/chưa xác nhận được trạng thái đồng bộ/i)).toBeInTheDocument();
    expect(screen.queryByText(/đã được đồng bộ thành công/i)).not.toBeInTheDocument();
    const attachments = await getDiaryAttachmentsByLog('uuid-t66-stable-001');
    expect(attachments).toHaveLength(1);
    expect(attachments[0].blob).toBeInstanceOf(Blob);
    syncSpy.mockRestore();
    readSpy.mockRestore();
  });

  it('T68.4. Lỗi IndexedDB sau phản hồi API không bị nhầm thành lỗi mạng/lưu offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/t68-image');
    api.post.mockResolvedValueOnce({
      data: {
        entry: {
          id: 701,
          work_item_id: 101,
          content: 'Nhật ký online có ảnh',
          client_id: 'uuid-t66-stable-001',
          entry_at: new Date().toISOString(),
        },
      },
    });
    const db = await openDiaryDB();
    failStorePutOnce(
      db,
      'diaryLogs',
      new DOMException('Storage quota exceeded', 'QuotaExceededError')
    );

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('category-dropdown'), {
      target: { value: '101' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: 'Nhật ký online có ảnh' },
    });
    fireEvent.change(screen.getByTestId('diary-image-input'), {
      target: {
        files: [new File(['image-data'], 'photo.jpg', { type: 'image/jpeg' })],
      },
    });

    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/không đủ dung lượng lưu trữ cục bộ/i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Nhật ký online có ảnh')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(await getDiaryLogsByProject(13)).toHaveLength(0);
  });

  it('T68.4. Transaction metadata hết quota thì giữ form và hiển thị rõ rằng dữ liệu chưa lưu', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/t68-quota-image');
    const db = await openDiaryDB();
    failStorePutOnce(
      db,
      'diaryLogs',
      new DOMException('Storage quota exceeded', 'QuotaExceededError')
    );

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
      target: { value: 'Nhật ký cần giữ trong biểu mẫu' },
    });
    fireEvent.change(screen.getByTestId('diary-image-input'), {
      target: {
        files: [new File(['image-data'], 'quota-photo.jpg', { type: 'image/jpeg' })],
      },
    });
    fireEvent.submit(screen.getByTestId('submit-diary-btn').closest('form'));

    expect(await screen.findByText(/không đủ dung lượng/i)).toBeInTheDocument();
    expect(screen.getByText(/Nhật ký và ảnh chưa được lưu/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Nhập nội dung/i)).toHaveValue(
      'Nhật ký cần giữ trong biểu mẫu'
    );
    expect(screen.getByAltText('quota-photo.jpg')).toBeInTheDocument();
    expect(await getDiaryLogsByProject(13)).toHaveLength(0);
    expect(await getDiaryAttachmentsByLog('uuid-t66-stable-001')).toHaveLength(0);
    expect(api.post).not.toHaveBeenCalled();
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

  it('chỉ cảnh báo khi có bản nháp chưa được lưu thành nhật ký', async () => {
    const { unmount } = render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());
    expect(screen.queryByText('Đang có bản nháp chưa gửi.')).not.toBeInTheDocument();

    unmount();
    localStorage.setItem('diary_draft_13', JSON.stringify({
      work_item_id: '101',
      entry_at: '2026-10-12T08:00',
      content: 'Bản nháp cần khôi phục',
      client_id: 'actual-unsent-draft',
    }));

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(await screen.findByText('Đang có bản nháp chưa gửi.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bản nháp cần khôi phục')).toBeInTheDocument();
  });

  it.each([
    ['pending', 'nhật ký offline đang chờ đồng bộ'],
    ['synced', 'nhật ký đã đồng bộ'],
  ])('không nhận diện %s là bản nháp chưa gửi (%s)', async (syncStatus) => {
    const clientId = `stored-diary-${syncStatus}`;
    const entryAt = '2026-10-12T01:00:00.000Z';
    await createDiaryEntry({
      id: clientId,
      client_id: clientId,
      projectId: 13,
      work_item_id: 101,
      content: 'Nội dung đã lưu thành nhật ký',
      entry_at: entryAt,
      syncStatus,
      ...(syncStatus === 'synced' ? { serverId: 301 } : {}),
    });
    localStorage.setItem('diary_draft_13', JSON.stringify({
      work_item_id: '101',
      entry_at: entryAt,
      content: 'Nội dung đã lưu thành nhật ký',
      client_id: clientId,
    }));

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());
    await waitFor(() => expect(localStorage.getItem('diary_draft_13')).toBeNull());
    expect(screen.queryByText('Đang có bản nháp chưa gửi.')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Nhập nội dung/i)).toHaveValue('');
    expect((await getDiaryLogsByProject(13))[0].syncStatus).toBe(syncStatus);
  });

  it('sau reload khi đồng bộ xong, bản nháp cũ không xuất hiện lại', async () => {
    const clientId = 'synced-before-reload';
    await createDiaryEntry({
      id: clientId,
      client_id: clientId,
      projectId: 13,
      work_item_id: 101,
      content: 'Đã đồng bộ trước reload',
      entry_at: '2026-10-12T01:00:00.000Z',
      syncStatus: 'pending',
    });
    await updateDiaryEntry(clientId, {
      serverId: 401,
      syncStatus: 'synced',
      syncedAt: new Date().toISOString(),
    });
    localStorage.setItem('diary_draft_13', JSON.stringify({
      work_item_id: '101',
      entry_at: '2026-10-12T01:00:00.000Z',
      content: 'Đã đồng bộ trước reload',
      client_id: clientId,
    }));

    const firstRender = render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('category-option-101')).toBeInTheDocument());
    firstRender.unmount();

    render(
      <DiaryEntryForm
        projectId="13"
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    await waitFor(() => expect(localStorage.getItem('diary_draft_13')).toBeNull());
    expect(screen.queryByText('Đang có bản nháp chưa gửi.')).not.toBeInTheDocument();
    expect((await getDiaryLogsByProject(13))[0].syncStatus).toBe('synced');
  });

  it('mở form tạo mới nhiều lần không tạo cảnh báo khi không có bản nháp', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <DiaryPage user={mockUser} />
      </MemoryRouter>
    );

    const openForm = async () => {
      await userEvent.click(screen.getByRole('button', { name: /Ghi nhật ký$/ }));
      await screen.findByText('Ghi nhật ký thi công');
      expect(screen.queryByText('Đang có bản nháp chưa gửi.')).not.toBeInTheDocument();
    };
    const closeForm = async () => {
      const closeButton = screen.getByText('Ghi nhật ký thi công')
        .parentElement.querySelector('button');
      await userEvent.click(closeButton);
      await waitFor(() => expect(screen.queryByText('Ghi nhật ký thi công')).not.toBeInTheDocument());
    };

    await openForm();
    await closeForm();
    await openForm();
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
