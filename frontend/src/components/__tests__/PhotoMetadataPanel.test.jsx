import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import PhotoMetadataPanel from '../PhotoMetadataPanel';
import api from '../../lib/api';

vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('PhotoMetadataPanel Component (S-40 / T-106)', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('không render gì khi isOpen = false', () => {
    const { container } = render(
      <PhotoMetadataPanel
        projectId={1}
        photoId={101}
        kind="diary"
        isOpen={false}
        onClose={mockOnClose}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hiển thị trạng thái loading khi đang tải dữ liệu', () => {
    api.get.mockReturnValueOnce(new Promise(() => {})); // pending promise
    render(
      <PhotoMetadataPanel
        projectId={1}
        photoId={101}
        kind="diary"
        isOpen={true}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByText('Đang đọc siêu dữ liệu...')).toBeInTheDocument();
  });

  it('hiển thị lỗi khi API thất bại', async () => {
    api.get.mockRejectedValueOnce({
      response: { data: { message: 'Không tìm thấy ảnh trong dự án' } },
    });
    render(
      <PhotoMetadataPanel
        projectId={1}
        photoId={999}
        kind="diary"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy ảnh trong dự án')).toBeInTheDocument();
    });
  });

  it('hiển thị toạ độ thô và link Google Maps khi người dùng có quyền photo.view_gps', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        status: 'complete',
        status_label: 'Đầy đủ thời gian và toạ độ',
        captured_at: '2026-03-15T07:30:00.000Z',
        captured_at_source: 'exif_offset',
        source: 'file',
        has_gps: true,
        gps: {
          latitude: 10.762622,
          longitude: 106.660172,
          accuracy_m: 4.5,
        },
      },
    });

    render(
      <PhotoMetadataPanel
        projectId={1}
        photoId={101}
        kind="diary"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('metadata-status-badge')).toHaveTextContent(
        'Đầy đủ thời gian và toạ độ'
      );
    });

    expect(screen.getByTestId('captured-at-text')).toBeInTheDocument();
    expect(screen.getByText(/EXIF gốc \(kèm múi giờ\)/)).toBeInTheDocument();

    // Toạ độ chi tiết
    expect(screen.getByTestId('gps-coordinates-section')).toBeInTheDocument();
    expect(screen.getByText('10.762622')).toBeInTheDocument();
    expect(screen.getByText('106.660172')).toBeInTheDocument();
    expect(screen.getByText('±4.5 m')).toBeInTheDocument();

    // Link Google Maps
    const mapLink = screen.getByRole('link', { name: /Xem trên bản đồ/i });
    expect(mapLink).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=10.762622,106.660172'
    );

    // Không hiển thị cảnh báo hạn chế
    expect(screen.queryByTestId('gps-restricted-section')).toBeNull();
  });

  it('hiển thị cảnh báo bảo vệ vị trí và KHÔNG lộ toạ độ thô khi người dùng không có quyền photo.view_gps', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        status: 'complete',
        status_label: 'Đầy đủ thời gian và toạ độ',
        captured_at: '2026-03-15T07:30:00.000Z',
        captured_at_source: 'exif_offset',
        source: 'file',
        has_gps: true,
        // Không có key gps
      },
    });

    render(
      <PhotoMetadataPanel
        projectId={1}
        photoId={101}
        kind="diary"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('gps-restricted-section')).toBeInTheDocument();
    });

    expect(screen.getByText(/Để bảo vệ quyền riêng tư vị trí của người lao động/i)).toBeInTheDocument();

    // Tuyệt đối không hiển thị toạ độ chi tiết hay link bản đồ
    expect(screen.queryByTestId('gps-coordinates-section')).toBeNull();
    expect(screen.queryByRole('link', { name: /Xem trên bản đồ/i })).toBeNull();
  });

  it('hiển thị thông báo khi ảnh không có siêu dữ liệu gốc (status none)', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        status: 'none',
        status_label: 'Ảnh không có siêu dữ liệu gốc',
        captured_at: null,
        captured_at_source: null,
        source: 'file',
        has_gps: false,
      },
    });

    render(
      <PhotoMetadataPanel
        projectId={1}
        photoId={102}
        kind="acceptance"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('metadata-status-badge')).toHaveTextContent(
        'Ảnh không có siêu dữ liệu gốc'
      );
    });

    expect(screen.getByText('Ảnh không ghi nhận thời gian chụp gốc')).toBeInTheDocument();
    expect(screen.getByText('Ảnh không có thông tin toạ độ GPS')).toBeInTheDocument();
  });

  it('gọi callback onClose khi bấm nút đóng', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        status: 'none',
        status_label: 'Ảnh không có siêu dữ liệu gốc',
        has_gps: false,
      },
    });

    render(
      <PhotoMetadataPanel
        projectId={1}
        photoId={101}
        kind="diary"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('close-panel-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('close-panel-btn'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  describe('Đánh giá phạm vi công trường (S-41 / T-108)', () => {
    it('hiển thị badge Trong phạm vi công trường khi status = inside', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'complete',
          status_label: 'Đầy đủ thời gian và toạ độ',
          has_gps: true,
          geofence: {
            status: 'inside',
            distance_m: 89.2,
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('geofence-status-inside')).toHaveTextContent(
          'Trong phạm vi công trường'
        );
      });
      expect(screen.getByText(/cách tâm 89,2 m/i)).toBeInTheDocument();
    });

    it('hiển thị cảnh báo Ngoài phạm vi công trường khi status = outside', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'complete',
          status_label: 'Đầy đủ thời gian và toạ độ',
          has_gps: true,
          geofence: {
            status: 'outside',
            distance_m: 133.4,
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={102}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('geofence-status-outside')).toHaveTextContent(
          'Ngoài phạm vi công trường'
        );
      });
      expect(screen.getByText(/cách tâm 133,4 m/i)).toBeInTheDocument();
      expect(screen.getByText(/Ảnh được chụp ngoài bán kính công trường quy định/i)).toBeInTheDocument();
    });

    it('hiển thị thông báo khi dự án chưa cấu hình phạm vi', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'complete',
          has_gps: true,
          geofence: {
            status: 'no_site_config',
            distance_m: null,
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={103}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('Dự án chưa cấu hình toạ độ tâm và bán kính công trường')
        ).toBeInTheDocument();
      });
    });

    it('Hardening: hiển thị nguồn toạ độ bằng chữ từ ảnh gốc', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'complete',
          has_gps: true,
          gps_source: 'file_exif',
          geofence: { status: 'inside', distance_m: 50, basis: 'file_exif' },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={104}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('gps-source-text')).toHaveTextContent('Toạ độ từ ảnh gốc');
      });
      expect(screen.getByTestId('geofence-status-inside')).toHaveTextContent('Trong phạm vi công trường');
    });

    it('Hardening: hiển thị nguồn toạ độ client báo và nhãn chưa xác thực', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'complete',
          has_gps: true,
          gps_source: 'client_reported',
          geofence: { status: 'inside', distance_m: 50, basis: 'client_reported' },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={105}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('gps-source-text')).toHaveTextContent(
          'Toạ độ do thiết bị báo, chưa xác thực từ ảnh gốc'
        );
      });
      expect(screen.getByTestId('geofence-status-inside')).toHaveTextContent(
        'Trong phạm vi (chưa xác thực)'
      );
      expect(screen.getByText('Toạ độ do thiết bị báo, chưa xác thực từ ảnh gốc.')).toBeInTheDocument();
    });

    it('Hardening: ảnh thiếu metadata hiện thông báo Không có dữ liệu', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'none',
          status_label: 'Ảnh không có siêu dữ liệu gốc',
          has_gps: false,
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={106}
          kind="diary"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Không có dữ liệu/i)).toBeInTheDocument();
      });
    });
  });
});
