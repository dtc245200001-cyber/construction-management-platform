import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import DiaryDayForm from '../DiaryDayForm';
import api from '../../lib/api';

vi.mock('../../lib/api');

// S-22 / T-51 — Tests cho DiaryDayForm khớp UI hiện tại:
// thời tiết chọn bằng nút (không phải select), placeholder mới,
// nút "Thêm" / "Lưu mục đầu ngày" / "Cập nhật", onSuccess nhận cả wrapper.

const mockCatalogs = {
  weather_types: [
    { id: 1, code: 'nang', label: 'Nắng', is_adverse: false },
    { id: 2, code: 'mua_ca_ngay', label: 'Mưa cả ngày', is_adverse: true },
  ],
  equipment_types: [
    { id: 1, code: 'may_xuc', label: 'Máy xúc', unit: 'chiếc' },
    { id: 2, code: 'may_ui', label: 'Máy ủi', unit: 'chiếc' },
  ],
};

const mockExisting = {
  id: 7,
  manpower_count: 10,
  weather_type_id: 1,
  weather_note: 'Ghi chú test',
  equipment: [{ equipment_type_id: 1, quantity: 2, label: 'Máy xúc', unit: 'chiếc' }],
  updated_at: '2026-10-09T10:00:00.000Z',
};

const putResponse = {
  project_id: 1,
  date: '2026-10-09',
  exists: true,
  can_edit: true,
  entries_count: 1,
  day: { id: 7, manpower_count: 15 },
};

describe('DiaryDayForm (S-22 / T-51)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: mockCatalogs });
    api.put.mockResolvedValue({ data: putResponse });
  });

  const renderForm = (props = {}) =>
    render(
      <DiaryDayForm
        projectId={1}
        date="2026-10-09"
        onClose={() => {}}
        onSuccess={() => {}}
        {...props}
      />
    );

  const manpowerInput = () =>
    screen.getByPlaceholderText('Ví dụ: 25 (Cho phép 0)');

  it('render form trống khi tạo mới', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByText('Ghi mục đầu ngày')).toBeInTheDocument();
    });

    expect(manpowerInput()).toHaveValue(null);
    expect(
      screen.getByText('Chưa có thiết bị nào. Bấm "Thêm" để chọn.')
    ).toBeInTheDocument();
    // Danh mục thời tiết render dạng nút
    expect(screen.getByRole('button', { name: /Nắng/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Mưa cả ngày/ })
    ).toBeInTheDocument();
  });

  it('render form điền sẵn khi có existing', async () => {
    renderForm({ existing: mockExisting });

    await waitFor(() => {
      expect(screen.getByText('Sửa mục đầu ngày')).toBeInTheDocument();
    });

    expect(manpowerInput()).toHaveValue(10);
    expect(
      screen.getByPlaceholderText('Ghi chú thêm (Mưa lúc mấy giờ...)')
    ).toHaveValue('Ghi chú test');
    // Một dòng thiết bị, select đang chọn Máy xúc (id 1)
    const eqSelects = screen.getAllByRole('combobox');
    expect(eqSelects).toHaveLength(1);
    expect(eqSelects[0]).toHaveValue('1');
  });

  it('thêm thiết bị và lưu — onSuccess nhận cả wrapper', async () => {
    const onSuccessMock = vi.fn();
    renderForm({ onSuccess: onSuccessMock });

    await waitFor(() => {
      expect(screen.getByText('Ghi mục đầu ngày')).toBeInTheDocument();
    });

    // Điền nhân lực
    fireEvent.change(manpowerInput(), { target: { value: '15' } });

    // Chọn thời tiết bằng nút
    fireEvent.click(screen.getByRole('button', { name: /Mưa cả ngày/ }));

    // Thêm thiết bị
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    const eqSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(eqSelect, { target: { value: '2' } });

    // Lưu
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục đầu ngày' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/projects/1/diary-days/2026-10-09',
        expect.objectContaining({
          manpower_count: 15,
          weather_type_id: 2,
          equipment: [{ equipment_type_id: 2, quantity: 1 }],
        })
      );
    });

    expect(onSuccessMock).toHaveBeenCalledWith(putResponse);
  });

  it('submit khi trống → báo lỗi, không gọi API', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByText('Ghi mục đầu ngày')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục đầu ngày' }));

    expect(
      await screen.findByText(
        'Vui lòng điền ít nhất một thông tin (nhân lực, thời tiết, hoặc thiết bị).'
      )
    ).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('nhân lực âm → lỗi field, không gọi API', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByText('Ghi mục đầu ngày')).toBeInTheDocument();
    });

    fireEvent.change(manpowerInput(), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục đầu ngày' }));

    expect(await screen.findByText('Không được là số âm.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('quantity > 9999 → lỗi field, không gọi API', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByText('Ghi mục đầu ngày')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    const eqSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(eqSelect, { target: { value: '1' } });

    // spinbutton[0] là nhân lực, spinbutton[1] là số lượng thiết bị
    const qtyInput = screen.getAllByRole('spinbutton')[1];
    fireEvent.change(qtyInput, { target: { value: '10000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục đầu ngày' }));

    expect(
      await screen.findByText('Số lượng phải từ 1 đến 9.999.')
    ).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('409 → hiện thông báo xung đột, tải lại điền dữ liệu mới', async () => {
    const conflictDay = {
      ...mockExisting,
      manpower_count: 99,
      updated_at: '2026-10-09T12:00:00.000Z',
    };
    api.put.mockRejectedValueOnce({
      response: { status: 409, data: { day: conflictDay } },
    });
    renderForm({ existing: mockExisting });

    await waitFor(() => {
      expect(screen.getByText('Sửa mục đầu ngày')).toBeInTheDocument();
    });

    fireEvent.change(manpowerInput(), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật' }));

    expect(
      await screen.findByText(
        'Người khác vừa sửa mục đầu ngày này. Vui lòng tải lại dữ liệu mới.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tải lại dữ liệu mới/ }));
    expect(manpowerInput()).toHaveValue(99);
  });

  it('403 → báo không có quyền ghi', async () => {
    api.put.mockRejectedValueOnce({ response: { status: 403, data: {} } });
    renderForm();

    await waitFor(() => {
      expect(screen.getByText('Ghi mục đầu ngày')).toBeInTheDocument();
    });

    fireEvent.change(manpowerInput(), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục đầu ngày' }));

    expect(
      await screen.findByText('Bạn không có quyền ghi nhật ký trong dự án này.')
    ).toBeInTheDocument();
  });

  it('catalog lỗi → hiện thông báo không tải được danh mục', async () => {
    api.get.mockRejectedValueOnce(new Error('network'));
    renderForm();

    expect(
      await screen.findByText(
        'Không thể tải danh mục. Vui lòng kiểm tra kết nối mạng.'
      )
    ).toBeInTheDocument();
  });
});
