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
});
