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
    api.get.mockResolvedValue({ data: {} });
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
  });

  describe('Kiểm tra quy tắc bằng chứng & bất thường (Story S-42 / T-110)', () => {
    it('hiển thị kết quả kiểm tra hợp lệ / bình thường (clean state)', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'complete',
          status_label: 'Đầy đủ thời gian và toạ độ',
          captured_at: '2026-10-15T08:00:00.000Z',
          has_gps: false,
          inspection: {
            status: 'clean',
            status_label: 'Hợp lệ / Bình thường',
            can_evaluate: true,
            has_sufficient_data: true,
            warnings: [],
            warnings_count: 0,
            metadata: {
              width: 4000,
              height: 3000,
              aspect_ratio: '4:3 (1.333)',
              make: 'Apple',
              model: 'iPhone 15 Pro',
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={201}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent(
          'Hợp lệ'
        );
      });

      expect(screen.getByTestId('inspection-clean-state')).toBeInTheDocument();
      expect(
        screen.getByText(/không phát hiện kích thước chụp lại màn hình/i)
      ).toBeInTheDocument();

      // Thông số kỹ thuật
      expect(screen.getByTestId('inspection-metadata-details')).toBeInTheDocument();
      expect(screen.getByText('4000 × 3000 px')).toBeInTheDocument();
      expect(screen.getByText('4:3 (1.333)')).toBeInTheDocument();
      expect(screen.getByText('Apple iPhone 15 Pro')).toBeInTheDocument();
    });

    it('hiển thị danh sách nhiều cảnh báo với lý do và độ nghiêm trọng (warning state)', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'none',
          status_label: 'Ảnh không có siêu dữ liệu gốc',
          has_gps: false,
          inspection: {
            status: 'warning',
            status_label: 'Cần xác minh (có dấu hiệu nghi vấn)',
            can_evaluate: true,
            has_sufficient_data: true,
            warnings_count: 2,
            warnings: [
              {
                code: 'SCREENSHOT_DETECTED',
                severity: 'high',
                title: 'Nghi vấn ảnh chụp lại màn hình',
                reason:
                  'Kích thước ảnh 1080x2400 (tỷ lệ 9:20) đặc trưng của ảnh chụp màn hình điện thoại, đồng thời thiếu thông tin phần cứng máy ảnh.',
                confidence: 'high',
              },
              {
                code: 'CAPTURE_DATE_DRIFT',
                severity: 'medium',
                title: 'Thời gian chụp sai lệch lớn so với đợt nghiệm thu',
                reason:
                  'Ảnh được chụp cách ngày lập phiếu 45 ngày (vượt quá 30 ngày).',
                confidence: 'medium',
              },
            ],
            metadata: {
              width: 1080,
              height: 2400,
              aspect_ratio: '9:20 (0.450)',
              make: null,
              model: null,
              screenshot_evaluation: {
                is_screenshot_likely: true,
                matched_ratio: '9:20',
              },
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={202}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent(
          'Cần xác minh'
        );
      });

      expect(screen.getByTestId('inspection-warnings-list')).toBeInTheDocument();

      // Cảnh báo 1: SCREENSHOT_DETECTED
      const warn1 = screen.getByTestId('inspection-warning-SCREENSHOT_DETECTED');
      expect(warn1).toHaveTextContent('Nghi vấn ảnh chụp lại màn hình');
      expect(warn1).toHaveTextContent('Nghi vấn cao');
      expect(warn1).toHaveTextContent('Kích thước ảnh 1080x2400 (tỷ lệ 9:20)');
      expect(warn1).toHaveTextContent('Độ tin cậy dấu hiệu: Cao');

      // Cảnh báo 2: CAPTURE_DATE_DRIFT
      const warn2 = screen.getByTestId('inspection-warning-CAPTURE_DATE_DRIFT');
      expect(warn2).toHaveTextContent(
        'Thời gian chụp sai lệch lớn so với đợt nghiệm thu'
      );
      expect(warn2).toHaveTextContent('Cần kiểm tra');
      expect(warn2).toHaveTextContent('Ảnh được chụp cách ngày lập phiếu 45 ngày');
      expect(warn2).toHaveTextContent('Độ tin cậy dấu hiệu: Trung bình');

      // Khuyến nghị đối chiếu không tự động chặn
      expect(
        screen.getByText(/Không tự động kết luận gian lận và không tự ý chặn duyệt phiếu/i)
      ).toBeInTheDocument();
    });

    it('hiển thị trạng thái dữ liệu không đầy đủ (incomplete_data state)', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'none',
          status_label: 'Ảnh không có siêu dữ liệu gốc',
          has_gps: false,
          inspection: {
            status: 'incomplete_data',
            status_label: 'Dữ liệu không đầy đủ (thiếu EXIF máy ảnh)',
            can_evaluate: false,
            has_sufficient_data: false,
            warnings: [],
            metadata: {
              width: 1920,
              height: 1080,
              aspect_ratio: '16:9 (1.778)',
              make: null,
              model: null,
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={203}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent(
          'Không đủ dữ liệu'
        );
      });

      expect(screen.getByTestId('inspection-incomplete-state')).toBeInTheDocument();
      expect(
        screen.getByText(/Tệp ảnh không chứa các thẻ EXIF phần cứng của máy ảnh/i)
      ).toBeInTheDocument();
    });

    it('hiển thị trạng thái lỗi kiểm tra tệp (error state)', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'unreadable',
          status_label: 'Tệp không đọc được',
          has_gps: false,
          inspection: {
            status: 'error',
            status_label: 'Lỗi kiểm tra tệp',
            can_evaluate: false,
            has_sufficient_data: false,
            warnings: [
              {
                code: 'FILE_CORRUPTED',
                severity: 'high',
                title: 'Tệp ảnh bị hỏng hoặc không đọc được',
                reason: 'Không thể phân tích cấu trúc nhị phân của tệp ảnh.',
              },
            ],
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={204}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent(
          'Lỗi kiểm tra'
        );
      });

      expect(screen.getByTestId('inspection-error-state')).toBeInTheDocument();
      expect(
        screen.getByText(/Không thể trích xuất hoặc phân tích tệp ảnh do tệp bị hỏng/i)
      ).toBeInTheDocument();
    });

    it('cho phép thử lại khi API lỗi bằng nút thử lại (retry)', async () => {
      api.get.mockRejectedValueOnce(new Error('Mất kết nối máy chủ'));

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={205}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('retry-metadata-btn')).toBeInTheDocument();
      });

      // Lần thứ 2: API thành công
      api.get.mockResolvedValueOnce({
        data: {
          status: 'none',
          status_label: 'Ảnh không có siêu dữ liệu gốc',
          has_gps: false,
          inspection: {
            status: 'clean',
            status_label: 'Hợp lệ / Bình thường',
            warnings: [],
          },
        },
      });

      fireEvent.click(screen.getByTestId('retry-metadata-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent(
          'Hợp lệ'
        );
      });
    });

    it('hiển thị nhãn Lỗi kiểm tra và thông báo lỗi máy chủ khi API trả về 500, không tự kết luận ảnh không hợp lệ', async () => {
      api.get.mockRejectedValueOnce({
        response: {
          status: 500,
          data: { message: 'Lỗi máy chủ' },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={206}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Lỗi máy chủ')).toBeInTheDocument();
      });

      // Nhãn góc trên là "Lỗi kiểm tra", TUYỆT ĐỐI không phải "Không hợp lệ"
      expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Lỗi kiểm tra');
      expect(screen.queryByText('Không hợp lệ')).toBeNull();
      expect(screen.getByTestId('retry-metadata-btn')).toBeInTheDocument();
    });

    it('hiển thị thông báo quyền hạn khi API trả về 403 với field error', async () => {
      api.get.mockRejectedValueOnce({
        response: {
          status: 403,
          data: { error: 'Bạn không có quyền truy cập dự án này' },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={207}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Bạn không có quyền truy cập dự án này')).toBeInTheDocument();
      });
    });
  });

  describe('Khóa cuộn nền và cấu trúc cuộn modal (Modal Scrolling & Layout)', () => {
    it('khóa cuộn document.body khi modal mở và phục hồi khi đóng', () => {
      document.body.style.overflow = 'visible';

      const { unmount } = render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).toBe('visible');
    });

    it('modal có vùng nội dung cuộn riêng với min-h-0 và header/footer cố định', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'none',
          status_label: 'Ảnh không có siêu dữ liệu gốc',
          has_gps: false,
        },
      });

      const { baseElement } = render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const modalDialog = baseElement.querySelector('[role="dialog"]');
      expect(modalDialog).toBeInTheDocument();
      expect(modalDialog).toHaveClass('overflow-hidden');

      // Card modal có max-h-[90dvh] và flex-col
      const card = modalDialog.querySelector('.relative.w-full.max-w-lg');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('flex-col');
      expect(card).toHaveClass('max-h-[90dvh]');

      // Vùng cuộn có flex-1 min-h-0 overflow-y-auto
      const scrollableBody = card.querySelector('.overflow-y-auto');
      expect(scrollableBody).toBeInTheDocument();
      expect(scrollableBody).toHaveClass('flex-1');
      expect(scrollableBody).toHaveClass('min-h-0');
    });
  });
});

