import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SiteGeofencePage from '../SiteGeofencePage';
import api from '../../lib/api';

const mockCan = vi.fn();
let mockRole = 'ban_quan_ly';

vi.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: mockCan,
    role: mockRole,
  }),
}));

vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SiteGeofencePage Component (S-41 / T-107)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('current_project_id', '1');
    mockRole = 'ban_quan_ly';
    mockCan.mockReturnValue(true);
  });

  it('tải và hiển thị cấu hình phạm vi hiện tại', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        site_latitude: 20.845,
        site_longitude: 106.688,
        site_radius_m: 200,
        site_geofence_updated_at: '2026-03-20T10:00:00.000Z',
      },
    });

    render(<SiteGeofencePage />);

    expect(screen.getByText('Phạm vi công trường (Geofence)')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('input-latitude')).toHaveValue('20.845');
      expect(screen.getByTestId('input-longitude')).toHaveValue('106.688');
      expect(screen.getByTestId('input-radius')).toHaveValue(200);
      expect(screen.getByTestId('status-badge-active')).toHaveTextContent('Đã kích hoạt phạm vi');
    });
  });

  it('báo lỗi khi nhập dữ liệu không hợp lệ (ngoài phạm vi, hơn 6 số thập phân, (0,0))', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        site_latitude: null,
        site_longitude: null,
        site_radius_m: null,
      },
    });

    render(<SiteGeofencePage />);

    await waitFor(() => {
      expect(screen.getByTestId('input-latitude')).toHaveValue('');
    });

    // 1. Nhập toạ độ hơn 6 số thập phân
    fireEvent.change(screen.getByTestId('input-latitude'), {
      target: { value: '20.1234567' },
    });
    fireEvent.change(screen.getByTestId('input-longitude'), {
      target: { value: '106.123456' },
    });
    fireEvent.change(screen.getByTestId('input-radius'), {
      target: { value: '100' },
    });

    fireEvent.click(screen.getByTestId('btn-save-geofence'));

    await waitFor(() => {
      expect(screen.getByTestId('form-errors-box')).toBeInTheDocument();
      expect(screen.getByText('Vĩ độ tối đa 6 chữ số thập phân')).toBeInTheDocument();
    });

    // 2. Nhập toạ độ (0, 0)
    fireEvent.change(screen.getByTestId('input-latitude'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByTestId('input-longitude'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('btn-save-geofence'));

    await waitFor(() => {
      expect(screen.getByText('Toạ độ (0, 0) không hợp lệ (Null Island)')).toBeInTheDocument();
    });
  });

  it('lưu cấu hình thành công và hiển thị kết quả tính lại ảnh', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        site_latitude: null,
        site_longitude: null,
        site_radius_m: null,
      },
    });

    api.put.mockResolvedValueOnce({
      data: {
        message: 'Cập nhật phạm vi công trường thành công',
        data: {
          site_latitude: 20.845,
          site_longitude: 106.688,
          site_radius_m: 250,
          site_geofence_updated_at: '2026-03-20T12:00:00.000Z',
        },
        recalculated: {
          acceptance_photos: 12,
          diary_photos: 5,
        },
      },
    });

    render(<SiteGeofencePage />);

    await waitFor(() => {
      expect(screen.getByTestId('input-latitude')).toHaveValue('');
    });

    fireEvent.change(screen.getByTestId('input-latitude'), {
      target: { value: '20.845000' },
    });
    fireEvent.change(screen.getByTestId('input-longitude'), {
      target: { value: '106.688000' },
    });
    fireEvent.change(screen.getByTestId('input-radius'), {
      target: { value: '250' },
    });

    fireEvent.click(screen.getByTestId('btn-save-geofence'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/projects/1/site-geofence', {
        latitude: 20.845,
        longitude: 106.688,
        radius_m: 250,
      });
      expect(screen.getByTestId('recalculated-banner')).toBeInTheDocument();
      expect(screen.getByText(/12 ảnh nghiệm thu, 5 ảnh nhật ký/i)).toBeInTheDocument();
    });
  });

  it('mở hộp thoại xác nhận và xóa cấu hình thành công', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        site_latitude: 20.845,
        site_longitude: 106.688,
        site_radius_m: 200,
        site_geofence_updated_at: '2026-03-20T10:00:00.000Z',
      },
    });

    api.delete.mockResolvedValueOnce({
      data: {
        message: 'Đã xóa cấu hình phạm vi công trường',
        recalculated: {
          acceptance_photos: 10,
          diary_photos: 4,
        },
      },
    });

    render(<SiteGeofencePage />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-open-delete-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-open-delete-dialog'));

    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm-delete-geofence')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-confirm-delete-geofence'));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/projects/1/site-geofence');
      expect(screen.getByTestId('input-latitude')).toHaveValue('');
    });
  });

  it('hiển thị thông báo chỉ xem và vô hiệu hoá nút khi không có quyền manage', async () => {
    mockCan.mockReturnValue(false); // Không có quyền manage

    api.get.mockResolvedValueOnce({
      data: {
        site_latitude: 20.845,
        site_longitude: 106.688,
        site_radius_m: 200,
      },
    });

    render(<SiteGeofencePage />);

    await waitFor(() => {
      expect(screen.getByTestId('readonly-permission-notice')).toBeInTheDocument();
      expect(screen.getByTestId('input-latitude')).toBeDisabled();
      expect(screen.getByTestId('input-longitude')).toBeDisabled();
      expect(screen.getByTestId('input-radius')).toBeDisabled();
      expect(screen.queryByTestId('btn-save-geofence')).toBeNull();
    });
  });
});
