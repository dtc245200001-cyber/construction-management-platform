import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import PhotoMetadataPanel, { gcd, calculateAspectRatio } from '../PhotoMetadataPanel';
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

  it('ghi log lỗi khi API thất bại và không hiển thị hộp thông báo màu đỏ trong modal', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
      expect(api.get).toHaveBeenCalled();
    });
    expect(screen.queryByText('Không tìm thấy ảnh trong dự án')).not.toBeInTheDocument();
    expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
    expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Lỗi khi tải thông tin ảnh:',
      expect.anything()
    );
    consoleSpy.mockRestore();
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

    expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ');
    expect(screen.getAllByText('Không có dữ liệu').length).toBeGreaterThanOrEqual(2);
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

  describe('Xóa hộp Đối chiếu phạm vi công trường (Yêu cầu 3 & Tiêu chuẩn 10)', () => {
    it('không hiển thị hộp Đối chiếu phạm vi công trường kể cả khi status = inside', async () => {
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
        expect(screen.getByText('Chi tiết ảnh')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('geofence-evaluation-section')).not.toBeInTheDocument();
      expect(screen.queryByTestId('geofence-status-inside')).not.toBeInTheDocument();
      expect(screen.queryByText(/Đối chiếu phạm vi công trường/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Trong phạm vi công trường/i)).not.toBeInTheDocument();
    });

    it('không hiển thị hộp Đối chiếu phạm vi công trường khi status = outside', async () => {
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
        expect(screen.getByText('Chi tiết ảnh')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('geofence-evaluation-section')).not.toBeInTheDocument();
      expect(screen.queryByTestId('geofence-status-outside')).not.toBeInTheDocument();
      expect(screen.queryByText(/Đối chiếu phạm vi công trường/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Ngoài phạm vi công trường/i)).not.toBeInTheDocument();
    });

    it('không hiển thị hộp kể cả khi dự án chưa cấu hình phạm vi hoặc ảnh không có GPS', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          status: 'none',
          has_gps: false,
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
        expect(screen.getByText('Chi tiết ảnh')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('geofence-evaluation-section')).not.toBeInTheDocument();
      expect(screen.queryByText(/Đối chiếu phạm vi công trường/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Dự án chưa cấu hình toạ độ tâm và bán kính công trường')).not.toBeInTheDocument();
    });
  });

  describe('Thay Kích thước tệp bằng Tỷ lệ khung hình (Yêu cầu 2 & Tiêu chuẩn 7, 8)', () => {
    it('hàm calculateAspectRatio rút gọn chính xác tỷ lệ bằng GCD: 4:3, 16:9, 1:1, 8:5', () => {
      // 2880 × 2160 -> 4:3
      expect(calculateAspectRatio(2880, 2160)).toBe('4:3');
      // 1920 × 1080 -> 16:9
      expect(calculateAspectRatio(1920, 1080)).toBe('16:9');
      // 1080 × 1080 -> 1:1
      expect(calculateAspectRatio(1080, 1080)).toBe('1:1');
      // 2880 × 1800 -> 8:5
      expect(calculateAspectRatio(2880, 1800)).toBe('8:5');
      // Ảnh dọc: 1080 × 1920 -> 9:16
      expect(calculateAspectRatio(1080, 1920)).toBe('9:16');
      // Ảnh dọc: 2160 × 2880 -> 3:4
      expect(calculateAspectRatio(2160, 2880)).toBe('3:4');
    });

    it('hàm calculateAspectRatio trả về "Không có dữ liệu" khi thiếu hoặc sai kích thước', () => {
      expect(calculateAspectRatio(null, null)).toBe('Không có dữ liệu');
      expect(calculateAspectRatio(0, 1080)).toBe('Không có dữ liệu');
      expect(calculateAspectRatio(1920, 0)).toBe('Không có dữ liệu');
      expect(calculateAspectRatio(-1920, 1080)).toBe('Không có dữ liệu');
      expect(calculateAspectRatio(undefined, undefined)).toBe('Không có dữ liệu');
    });

    it('giao diện hiển thị Tỷ lệ khung hình và KHÔNG còn dòng Kích thước tệp', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'evidence-4x3.jpg',
          file_size: 2450000,
          mime_type: 'image/jpeg',
          status: 'complete',
          inspection: {
            metadata: {
              width: 2880,
              height: 2160,
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
        expect(screen.getByTestId('photo-aspect-ratio')).toHaveTextContent('4:3');
      });
      expect(screen.getByTestId('photo-resolution')).toHaveTextContent('2880 × 2160 px');
      // Tuyệt đối không hiển thị dòng Kích thước tệp
      expect(screen.queryByText('Kích thước tệp')).not.toBeInTheDocument();
    });

    it('giao diện hiển thị "Không có dữ liệu" khi không đọc được kích thước ảnh', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'no-dimension.png',
          file_size: 512000,
          mime_type: 'image/png',
          status: 'none',
          inspection: {
            metadata: {},
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
        expect(screen.getByTestId('photo-aspect-ratio')).toHaveTextContent('Không có dữ liệu');
      });
      expect(screen.getByTestId('photo-resolution')).toHaveTextContent('Không có dữ liệu');
      expect(screen.queryByText('Kích thước tệp')).not.toBeInTheDocument();
    });
  });

  describe('Hỗ trợ các định dạng ảnh và xử lý lỗi / thử lại (Yêu cầu 1 & Tiêu chuẩn 1-6)', () => {
    it('1. Ảnh PNG có metadata: hiển thị đúng định dạng và tỷ lệ', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'site-plan.png',
          mime_type: 'image/png',
          status: 'complete',
          inspection: {
            status: 'clean',
            metadata: {
              width: 1920,
              height: 1080,
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={301}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('PNG')).toBeInTheDocument();
      });
      expect(screen.getByTestId('photo-aspect-ratio')).toHaveTextContent('16:9');
    });

    it('2. Ảnh PNG không có EXIF: hiển thị "Dữ liệu không đầy đủ", KHÔNG coi là lỗi máy chủ', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'screenshot-clean.png',
          mime_type: 'image/png',
          status: 'none',
          data_status: 'incomplete_data',
          inspection: {
            status: 'incomplete_data',
            metadata: {
              width: 1080,
              height: 1080,
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={302}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ');
      });
      expect(screen.queryByText('Lỗi máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi kiểm tra')).not.toBeInTheDocument();
      expect(screen.getByTestId('photo-aspect-ratio')).toHaveTextContent('1:1');
    });

    it('3. Ảnh JPEG: hiển thị đầy đủ thông tin tệp và tỷ lệ 8:5', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'photo-field.jpg',
          mime_type: 'image/jpeg',
          status: 'complete',
          inspection: {
            status: 'clean',
            metadata: {
              width: 2880,
              height: 1800,
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={303}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('JPEG')).toBeInTheDocument();
      });
      expect(screen.getByTestId('photo-aspect-ratio')).toHaveTextContent('8:5');
    });

    it('4. Ảnh WebP như download.webp: hiển thị định dạng WebP và tỷ lệ', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'download.webp',
          mime_type: 'image/webp',
          status: 'complete',
          inspection: {
            status: 'clean',
            metadata: {
              width: 1920,
              height: 1080,
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={304}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('WebP')).toBeInTheDocument();
      });
      expect(screen.getByTestId('photo-aspect-ratio')).toHaveTextContent('16:9');
    });

    it('5 & 6. API lỗi không hiển thị hộp thông báo màu đỏ và nhãn Cần tải lại, khi tải lại hiển thị dữ liệu chuẩn', async () => {
      // Lần 1: API lỗi 500
      api.get.mockRejectedValueOnce({
        response: {
          status: 500,
          data: { message: 'Lỗi máy chủ' },
        },
      });

      const { rerender } = render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={305}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });
      // Tuyệt đối không hiển thị "Lỗi máy chủ", "Lỗi kiểm tra", hộp đỏ và nhãn "Cần tải lại"
      expect(screen.queryByText('Lỗi máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi kiểm tra')).not.toBeInTheDocument();
      expect(screen.queryByText('Không thể tải thông tin tệp. Vui lòng bấm thử lại.')).not.toBeInTheDocument();
      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();
      expect(screen.getByTestId('close-x-btn')).toBeInTheDocument();

      // Lần 2: Mở ảnh hợp lệ, API trả về thành công
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'recovered.jpg',
          mime_type: 'image/jpeg',
          status: 'complete',
          data_status: 'full_data',
          inspection: {
            status: 'clean',
            metadata: {
              width: 2880,
              height: 2160,
            },
          },
        },
      });

      rerender(
        <PhotoMetadataPanel
          projectId={1}
          photoId={306}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu đầy đủ');
      });
      expect(screen.queryByText('Lỗi máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi kiểm tra')).not.toBeInTheDocument();
      expect(screen.getByTestId('photo-aspect-ratio')).toHaveTextContent('4:3');
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
          'Dữ liệu đầy đủ'
        );
      });

      expect(screen.getByTestId('inspection-clean-state')).toBeInTheDocument();
      expect(
        screen.getByText(/Không phát hiện dấu hiệu bất thường/i)
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
          'Dữ liệu không đầy đủ và cảnh báo'
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
          'Dữ liệu không đầy đủ'
        );
      });

      expect(screen.getByTestId('inspection-incomplete-state')).toBeInTheDocument();
      expect(
        screen.getByText(/Tệp ảnh thiếu một số trường EXIF bắt buộc/i)
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
          'Dữ liệu không đầy đủ và cảnh báo'
        );
      });

      expect(screen.getByTestId('inspection-warnings-section')).toBeInTheDocument();
      expect(
        screen.getByText(/Tệp ảnh bị hỏng hoặc không đọc được/i)
      ).toBeInTheDocument();
    });

    it('khi API lỗi, không hiển thị hộp thông báo màu đỏ và nhãn Cần tải lại, cập nhật dữ liệu khi đổi ảnh thành công', async () => {
      api.get.mockRejectedValueOnce(new Error('Mất kết nối máy chủ'));

      const { rerender } = render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={205}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();

      // Lần thứ 2: API thành công khi đổi ảnh
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

      rerender(
        <PhotoMetadataPanel
          projectId={1}
          photoId={2052}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent(
          'Dữ liệu đầy đủ'
        );
      });
    });

    it('không hiển thị nhãn Lỗi kiểm tra và Lỗi máy chủ khi API trả về 500, không tự kết luận ảnh không hợp lệ', async () => {
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
        expect(api.get).toHaveBeenCalled();
      });

      // Tuyệt đối không hiển thị "Lỗi máy chủ", "Lỗi kiểm tra", "Chưa có cấu hình tâm", "Cần tải lại", hay hộp đỏ
      expect(screen.queryByText('Lỗi máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi kiểm tra')).not.toBeInTheDocument();
      expect(screen.queryByText(/Chưa có cấu hình tâm/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();
      expect(screen.queryByText('Không hợp lệ')).toBeNull();
      expect(screen.queryByText('Dữ liệu đầy đủ')).toBeNull();
      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
      expect(screen.getByTestId('close-x-btn')).toBeInTheDocument();
    });

    it('khi API trả về 403 ghi log lỗi và không hiển thị hộp thông báo màu đỏ trong modal', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
        expect(api.get).toHaveBeenCalled();
      });

      expect(screen.queryByText('Bạn không có quyền truy cập dự án này')).not.toBeInTheDocument();
      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Lỗi khi tải thông tin ảnh:',
        expect.anything()
      );
      consoleSpy.mockRestore();
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

  describe('Luồng đóng/mở, trạng thái preview và xử lý lỗi không chặn đóng (Section 6 Requirements)', () => {
    it('1. đóng modal Chi tiết ảnh bằng nút X (close-x-btn)', () => {
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const closeXBtn = screen.getByTestId('close-x-btn');
      fireEvent.click(closeXBtn);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('2. đóng modal Chi tiết ảnh bằng nút Đóng (close-panel-btn)', () => {
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const closePanelBtn = screen.getByTestId('close-panel-btn');
      fireEvent.click(closePanelBtn);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('3. đóng modal khi nhấn phím Escape', () => {
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('4. đóng modal bằng cách bấm vào lớp nền backdrop bên ngoài card', () => {
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('5. mở chế độ phóng to ảnh (preview) và đóng lại', () => {
      const mockSwitchMode = vi.fn();
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          photo={{ url: '/test-img.jpg', file_name: 'test-img.jpg' }}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
          onSwitchMode={mockSwitchMode}
        />
      );

      const img = screen.getByRole('img');
      fireEvent.click(img);
      expect(mockSwitchMode).toHaveBeenCalledWith('preview');
    });

    it('5b. trong chế độ preview độc lập: hiển thị ảnh lớn và nút close-preview-btn đóng modal', () => {
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          photo={{ url: '/test-img.jpg', file_name: 'test-img.jpg' }}
          kind="acceptance"
          isOpen={true}
          mode="preview"
          onClose={mockOnClose}
        />
      );

      // Trong preview mode, chỉ có lightbox ảnh lớn, không có tiêu đề "Chi tiết ảnh"
      expect(screen.queryByText('Chi tiết ảnh')).toBeNull();
      const closeBtn = screen.getByTestId('close-preview-btn');
      expect(closeBtn).toBeInTheDocument();

      fireEvent.click(closeBtn);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('5c. đóng chế độ preview khi nhấn phím Escape', () => {
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          photo={{ url: '/test-img.jpg', file_name: 'test-img.jpg' }}
          kind="acceptance"
          isOpen={true}
          mode="preview"
          onClose={mockOnClose}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('6. khi API trả lỗi 500 (Lỗi máy chủ), modal vẫn đóng được bình thường bằng X và Đóng', async () => {
      api.get.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Lỗi máy chủ' } },
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
        expect(api.get).toHaveBeenCalled();
      });

      // Tuyệt đối không hiển thị "Lỗi máy chủ" hoặc "Lỗi kiểm tra", không hiển thị hộp đỏ và nhãn Cần tải lại
      expect(screen.queryByText('Lỗi máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi kiểm tra')).not.toBeInTheDocument();
      expect(screen.queryByText('Không thể tải thông tin tệp. Vui lòng bấm thử lại.')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();

      // Nút X và Đóng vẫn hoạt động hoàn toàn bình thường
      const closeX = screen.getByTestId('close-x-btn');
      fireEvent.click(closeX);
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      const closeBtn = screen.getByTestId('close-panel-btn');
      fireEvent.click(closeBtn);
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });

    it('7. mở chi tiết nhiều ảnh khác nhau liên tiếp cập nhật chính xác dữ liệu', () => {
      const { rerender } = render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          photo={{ file_name: 'photo_alpha.jpg' }}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('photo_alpha.jpg')).toBeInTheDocument();

      rerender(
        <PhotoMetadataPanel
          projectId={1}
          photoId={102}
          photo={{ file_name: 'photo_beta.jpg' }}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('photo_beta.jpg')).toBeInTheDocument();
      expect(screen.queryByText('photo_alpha.jpg')).toBeNull();
    });

    it('9. thông tin tệp, EXIF và kết quả kiểm tra không bị che khuất bởi overlay hay ảnh', () => {
      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={101}
          photo={{
            url: '/site.jpg',
            file_name: 'site.jpg',
            mime_type: 'image/jpeg',
            inspection: {
              status: 'warning',
              warnings: [
                {
                  code: 'SCREENSHOT_DETECTED',
                  title: 'Nghi vấn ảnh chụp lại màn hình',
                  reason: 'Kích thước đặc trưng màn hình',
                },
              ],
            },
          }}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      // Tất cả các phần thông tin đều hiển thị rõ ràng, không có lớp overlay che khuất
      expect(screen.getByText('Chi tiết ảnh')).toBeInTheDocument();
      expect(screen.getByText('Thông tin tệp')).toBeInTheDocument();
      expect(screen.getByText('Metadata EXIF')).toBeInTheDocument();
      expect(screen.queryByText(/Đối chiếu phạm vi công trường/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('inspection-warnings-section')).toBeInTheDocument();
      expect(screen.getByText('Nghi vấn ảnh chụp lại màn hình')).toBeInTheDocument();
      expect(screen.getByTestId('close-panel-btn')).toBeInTheDocument();
    });

    it('10. Người gửi (is_reviewer = false): xem thông tin tệp, trạng thái; thiết bị EXIF hiển thị "Không có dữ liệu"', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'evidence_01.jpg',
          file_size: 1048576,
          mime_type: 'image/jpeg',
          uploaded_by_name: 'Kỹ sư Giám sát',
          is_reviewer: false,
          has_gps: true,
          status: 'complete',
          captured_at: '2026-03-15T07:30:00.000Z',
          inspection: {
            status: 'warning',
            summary: 'Phát hiện dấu hiệu cần xác minh',
            warnings: [
              {
                code: 'SCREENSHOT_SUSPECTED',
                title: 'Dấu hiệu ảnh chụp lại màn hình',
                reason: 'Kích thước ảnh tương ứng với tỷ lệ màn hình điện thoại',
                severity: 'high',
              },
            ],
            metadata: {
              width: 1080,
              height: 2400,
              aspect_ratio: '9:20',
              file_size: 1048576,
              mime_type: 'image/jpeg',
            },
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
        expect(screen.getByText('evidence_01.jpg')).toBeInTheDocument();
      });

      // Xem được thông tin tệp và trạng thái
      expect(screen.getByText('JPEG')).toBeInTheDocument();
      expect(screen.getByTestId('photo-resolution')).toHaveTextContent('1080 × 2400 px');
      expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ và cảnh báo');
      expect(screen.getByText('Dấu hiệu ảnh chụp lại màn hình')).toBeInTheDocument();

      // GPS thô bị ẩn đối với người gửi, chỉ hiển thị thông báo quyền riêng tư
      expect(screen.getByTestId('gps-restricted-section')).toBeInTheDocument();

      // Các trường máy ảnh EXIF không lộ cho người gửi và hiển thị "Không có dữ liệu"
      const missingDataElements = screen.getAllByText('Không có dữ liệu');
      expect(missingDataElements.length).toBeGreaterThanOrEqual(3); // Thiết bị, Phần mềm, ISO, Khẩu độ, Tốc độ
    });

    it('11. Người duyệt (is_reviewer = true): xem đầy đủ thông số máy ảnh, toạ độ GPS và cảnh báo chi tiết', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'canon_full_exif.jpg',
          file_size: 2097152,
          mime_type: 'image/jpeg',
          uploaded_by_name: 'Kỹ sư Giám sát',
          is_reviewer: true,
          has_gps: true,
          status: 'complete',
          captured_at: '2026-03-15T07:30:00.000Z',
          gps: {
            latitude: 10.762622,
            longitude: 106.660172,
            accuracy_m: 3.5,
          },
          inspection: {
            status: 'warning',
            summary: 'Cần kiểm tra đối chiếu',
            warnings: [
              {
                code: 'DATE_TOO_FAR',
                title: 'Thời điểm chụp cách xa ngày lập phiếu',
                reason: 'Ảnh chụp trước ngày lập phiếu 40 ngày',
                severity: 'high',
                actual_value: '2026-02-04',
                comparison_value: '2026-03-16',
                action_suggestion: 'Đối chiếu nhật ký thi công',
                confidence: 'high',
              },
            ],
            metadata: {
              width: 1920,
              height: 1080,
              aspect_ratio: '16:9',
              make: 'Canon',
              model: 'EOS R5',
              software: 'v1.5.0',
              iso: '200',
              aperture: 'f/2.8',
              shutter_speed: '1/125s',
            },
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
        expect(screen.getByText('canon_full_exif.jpg')).toBeInTheDocument();
      });

      // Người duyệt xem được toạ độ GPS và link Google Maps
      expect(screen.getByTestId('gps-coordinates-section')).toBeInTheDocument();
      expect(screen.getByText(/10.762622/)).toBeInTheDocument();
      expect(screen.getByText(/106.660172/)).toBeInTheDocument();
      expect(screen.getByText(/Xem trên bản đồ/)).toBeInTheDocument();

      // Người duyệt xem được chi tiết thiết bị và thông số camera
      expect(screen.getByText('Canon EOS R5')).toBeInTheDocument();
      expect(screen.getByText('v1.5.0')).toBeInTheDocument();
      expect(screen.getByText('ISO 200')).toBeInTheDocument();
      expect(screen.getByText('f/2.8')).toBeInTheDocument();
      expect(screen.getByText('1/125s')).toBeInTheDocument();

      // Xem được thông số đối chiếu của cảnh báo
      expect(screen.getByText('2026-02-04')).toBeInTheDocument();
      expect(screen.getByText('2026-03-16')).toBeInTheDocument();
      expect(screen.getByText(/Đối chiếu nhật ký thi công/)).toBeInTheDocument();
    });

    it('12. khi API kiểm tra thất bại, không hiển thị hộp đỏ và Cần tải lại, tải lại thành công khi mở ảnh mới', async () => {
      api.get
        .mockRejectedValueOnce({
          response: { status: 500, data: { message: 'Lỗi kết nối máy chủ' } },
        })
        .mockResolvedValueOnce({
          data: {
            file_name: 'retry_success.jpg',
            status: 'clean',
            data_status: 'full_data',
            inspection: { status: 'clean' },
          },
        });

      const { rerender } = render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={103}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1);
      });

      expect(screen.queryByText('Lỗi kết nối máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi kiểm tra')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();

      rerender(
        <PhotoMetadataPanel
          projectId={1}
          photoId={104}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(screen.getByText('retry_success.jpg')).toBeInTheDocument();
      });
    });
  });

  describe('Kiểm thử 15 yêu cầu bắt buộc (Mục VII)', () => {
    // 1. EXIF đầy đủ, không có cảnh báo → “Dữ liệu đầy đủ”.
    it('1. EXIF đầy đủ, không có cảnh báo -> "Dữ liệu đầy đủ"', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'full_valid.jpg',
          mime_type: 'image/jpeg',
          status: 'complete',
          data_status: 'full_data',
          data_status_label: 'Dữ liệu đầy đủ',
          captured_at: '2026-10-15T08:00:00.000Z',
          missing_fields: [],
          inspection: {
            data_status: 'full_data',
            status: 'clean',
            warnings: [],
            metadata: {
              width: 4032,
              height: 3024,
              make: 'Apple',
              model: 'iPhone 15 Pro',
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={701}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu đầy đủ');
      });
      expect(screen.queryByTestId('missing-fields-section')).toBeNull();
    });

    // 2. Thiếu một trường EXIF bắt buộc, không có cảnh báo → “Dữ liệu không đầy đủ”.
    it('2. Thiếu một trường EXIF bắt buộc (thiết bị), không có cảnh báo -> "Dữ liệu không đầy đủ"', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'missing_device.jpg',
          mime_type: 'image/jpeg',
          status: 'complete',
          data_status: 'incomplete_data',
          data_status_label: 'Dữ liệu không đầy đủ',
          captured_at: '2026-10-15T08:00:00.000Z',
          missing_fields: [{ field: 'device', label: 'Không có thông tin thiết bị' }],
          inspection: {
            data_status: 'incomplete_data',
            status: 'incomplete_data',
            warnings: [],
            metadata: {
              width: 1920,
              height: 1080,
              make: null,
              model: null,
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={702}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ');
      });
      expect(screen.getByTestId('missing-fields-section')).toHaveTextContent('Không có thông tin thiết bị');
    });

    // 3. Thiếu nhiều trường EXIF, không có cảnh báo → “Dữ liệu không đầy đủ”.
    it('3. Thiếu nhiều trường EXIF, không có cảnh báo -> "Dữ liệu không đầy đủ"', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'missing_multiple.jpg',
          mime_type: 'image/jpeg',
          status: 'none',
          data_status: 'incomplete_data',
          data_status_label: 'Dữ liệu không đầy đủ',
          captured_at: null,
          missing_fields: [
            { field: 'captured_at', label: 'Không có thời gian chụp' },
            { field: 'device', label: 'Không có thông tin thiết bị' },
          ],
          inspection: {
            data_status: 'incomplete_data',
            status: 'incomplete_data',
            warnings: [],
            metadata: {
              width: 1920,
              height: 1080,
            },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={703}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ');
      });
      expect(screen.getByText('Không có thời gian chụp')).toBeInTheDocument();
      expect(screen.getByText('Không có thông tin thiết bị')).toBeInTheDocument();
    });

    // 4. Thiếu EXIF và có dấu hiệu cảnh báo → “Dữ liệu không đầy đủ và cảnh báo”.
    it('4. Thiếu EXIF và có dấu hiệu cảnh báo -> "Dữ liệu không đầy đủ và cảnh báo"', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'screenshot_warn.png',
          mime_type: 'image/png',
          status: 'none',
          data_status: 'incomplete_data_warning',
          data_status_label: 'Dữ liệu không đầy đủ và cảnh báo',
          missing_fields: [
            { field: 'captured_at', label: 'Không có thời gian chụp' },
            { field: 'device', label: 'Không có thông tin thiết bị' },
          ],
          inspection: {
            data_status: 'incomplete_data_warning',
            status: 'warning',
            warnings: [
              {
                code: 'SCREENSHOT_SUSPECTED',
                title: 'Dấu hiệu ảnh chụp lại màn hình',
                reason: 'Kích thước ảnh 1080x2400 tương ứng tỷ lệ màn hình điện thoại',
                severity: 'high',
              },
            ],
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={704}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ và cảnh báo');
      });
      expect(screen.getByText('Dấu hiệu ảnh chụp lại màn hình')).toBeInTheDocument();
      expect(screen.getByText('Không có thời gian chụp')).toBeInTheDocument();
    });

    // 5. Thiếu thời gian chụp.
    it('5. Thiếu thời gian chụp hiển thị "Không có dữ liệu" tại dòng thời gian chụp', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'no_captured_at.jpg',
          captured_at: null,
          data_status: 'incomplete_data',
          missing_fields: [{ field: 'captured_at', label: 'Không có thời gian chụp' }],
          inspection: {
            data_status: 'incomplete_data',
            metadata: { width: 1920, height: 1080, make: 'Canon' },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={705}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('no_captured_at.jpg')).toBeInTheDocument();
      });
      expect(screen.getByText('Không có thời gian chụp')).toBeInTheDocument();
      expect(screen.getAllByText('Không có dữ liệu').length).toBeGreaterThanOrEqual(1);
    });

    // 6. Thiếu GPS: không hiển thị "Chưa có cấu hình tâm" hoặc hộp đối chiếu.
    it('6. Thiếu GPS hiển thị "Không có dữ liệu", tuyệt đối không hiển thị "Chưa có cấu hình tâm"', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'no_gps.jpg',
          has_gps: false,
          gps: null,
          data_status: 'incomplete_data',
          missing_fields: [],
          inspection: { data_status: 'incomplete_data' },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={706}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('no_gps.jpg')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Chưa có cấu hình tâm/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Đối chiếu phạm vi công trường/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('geofence-evaluation-section')).not.toBeInTheDocument();
    });

    // 7. Ảnh có kích thước trùng kích thước màn hình phổ biến.
    it('7. Ảnh có kích thước trùng kích thước màn hình phổ biến hiển thị cảnh báo', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'phone_screen.jpg',
          data_status: 'incomplete_data_warning',
          inspection: {
            data_status: 'incomplete_data_warning',
            warnings: [
              {
                code: 'SCREENSHOT_SUSPECTED',
                title: 'Dấu hiệu ảnh chụp lại màn hình',
                reason: 'Kích thước ảnh 1080x2400 (tỷ lệ 9:20) đặc trưng màn hình điện thoại',
                severity: 'high',
              },
            ],
            metadata: { width: 1080, height: 2400 },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={707}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ và cảnh báo');
      });
      expect(screen.getByText(/Kích thước ảnh 1080x2400/i)).toBeInTheDocument();
    });

    // 8. Ảnh có thời gian chụp lệch ngày nghiệm thu.
    it('8. Ảnh có thời gian chụp lệch ngày nghiệm thu hiển thị cảnh báo thời gian', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'drift_time.jpg',
          data_status: 'incomplete_data_warning',
          inspection: {
            data_status: 'incomplete_data_warning',
            warnings: [
              {
                code: 'CAPTURE_DATE_DRIFT',
                title: 'Thời gian chụp sai lệch lớn so với đợt nghiệm thu',
                reason: 'Ảnh được chụp cách ngày lập phiếu 50 ngày',
                severity: 'medium',
                actual_value: '2026-08-01',
                comparison_value: '2026-10-15',
              },
            ],
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={708}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ và cảnh báo');
      });
      expect(screen.getByText('Thời gian chụp sai lệch lớn so với đợt nghiệm thu')).toBeInTheDocument();
      expect(screen.getByText('2026-08-01')).toBeInTheDocument();
      expect(screen.getByText('2026-10-15')).toBeInTheDocument();
    });

    // 9. Ảnh bình thường không bị cảnh báo sai.
    it('9. Ảnh bình thường không bị cảnh báo sai -> hiển thị "Dữ liệu đầy đủ"', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'clean_dslr.jpg',
          data_status: 'full_data',
          missing_fields: [],
          inspection: {
            data_status: 'full_data',
            warnings: [],
            metadata: { width: 3000, height: 2000, make: 'Nikon', model: 'D850' },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={709}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu đầy đủ');
      });
      expect(screen.queryByTestId('inspection-warnings-section')).toBeNull();
    });

    // 10. JPEG, PNG và WebP theo khả năng hỗ trợ thực tế.
    it('10. Hỗ trợ hiển thị đúng định dạng JPEG, PNG và WebP', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'sample.webp',
          mime_type: 'image/webp',
          data_status: 'full_data',
          inspection: { metadata: { width: 1200, height: 800 } },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={710}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('WebP')).toBeInTheDocument();
      });
    });

    // 11. File hỏng hoặc không đọc được.
    it('11. File hỏng hoặc không đọc được hiển thị cảnh báo tệp, không làm crash modal', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'corrupt.jpg',
          status: 'unreadable',
          data_status: 'incomplete_data_warning',
          inspection: {
            data_status: 'incomplete_data_warning',
            warnings: [
              {
                code: 'FILE_CORRUPTED',
                title: 'Tệp ảnh bị hỏng hoặc không đọc được',
                reason: 'Không thể phân tích cấu trúc nhị phân',
                severity: 'high',
              },
            ],
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={711}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inspection-status-badge')).toHaveTextContent('Dữ liệu không đầy đủ và cảnh báo');
      });
      expect(screen.getByText('Tệp ảnh bị hỏng hoặc không đọc được')).toBeInTheDocument();
    });

    // 12. API lỗi, không hiển thị hộp đỏ và nhãn Cần tải lại, tải lại dữ liệu khi đổi ảnh thành công
    it('12. API lỗi, không hiển thị hộp đỏ và nhãn Cần tải lại, tải lại dữ liệu khi đổi ảnh thành công', async () => {
      api.get.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Lỗi máy chủ' } },
      });

      const { rerender } = render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={712}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();

      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'success_reload.jpg',
          data_status: 'full_data',
          inspection: { data_status: 'full_data' },
        },
      });

      rerender(
        <PhotoMetadataPanel
          projectId={1}
          photoId={7122}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('success_reload.jpg')).toBeInTheDocument();
      });
    });

    // 13. Đảm bảo không hiển thị “Lỗi máy chủ”, “Lỗi kiểm tra” hoặc “Chưa có cấu hình tâm” trong modal Chi tiết ảnh.
    it('13. Đảm bảo không hiển thị "Lỗi máy chủ", "Lỗi kiểm tra" hoặc "Chưa có cấu hình tâm" trong modal Chi tiết ảnh', async () => {
      api.get.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Lỗi máy chủ' } },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={713}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      expect(screen.queryByText('Lỗi máy chủ')).not.toBeInTheDocument();
      expect(screen.queryByText('Lỗi kiểm tra')).not.toBeInTheDocument();
      expect(screen.queryByText(/Chưa có cấu hình tâm/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Đối chiếu phạm vi công trường/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();
    });

    // 14. Đảm bảo lỗi kỹ thuật không bị hiểu nhầm thành dữ liệu đầy đủ.
    it('14. Đảm bảo lỗi kỹ thuật không bị hiểu nhầm thành dữ liệu đầy đủ', async () => {
      api.get.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Lỗi máy chủ' } },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={714}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('retry-metadata-btn')).not.toBeInTheDocument();
      expect(screen.queryByText('Cần tải lại')).not.toBeInTheDocument();
      expect(screen.queryByText('Dữ liệu đầy đủ')).not.toBeInTheDocument();
      expect(screen.getByText('Chi tiết ảnh')).toBeInTheDocument();
      expect(screen.getByTestId('close-x-btn')).toBeInTheDocument();
    });

    // 15. Đảm bảo các cảnh báo được hiển thị đúng cho người duyệt.
    it('15. Đảm bảo các cảnh báo và toạ độ được hiển thị đúng cho người duyệt (is_reviewer = true)', async () => {
      api.get.mockResolvedValueOnce({
        data: {
          file_name: 'reviewer_photo.jpg',
          is_reviewer: true,
          has_gps: true,
          gps: { latitude: 10.7769, longitude: 106.7009 },
          data_status: 'incomplete_data_warning',
          inspection: {
            data_status: 'incomplete_data_warning',
            warnings: [
              {
                code: 'SCREENSHOT_SUSPECTED',
                title: 'Dấu hiệu ảnh chụp lại màn hình',
                reason: 'Kích thước ảnh đặc trưng màn hình',
                severity: 'high',
                action_suggestion: 'Yêu cầu kỹ sư cung cấp tệp ảnh gốc',
              },
            ],
            metadata: { width: 1080, height: 2340 },
          },
        },
      });

      render(
        <PhotoMetadataPanel
          projectId={1}
          photoId={715}
          kind="acceptance"
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('reviewer_photo.jpg')).toBeInTheDocument();
      });
      expect(screen.getByTestId('gps-coordinates-section')).toBeInTheDocument();
      expect(screen.getByText(/10.7769/)).toBeInTheDocument();
      expect(screen.getByText('Dấu hiệu ảnh chụp lại màn hình')).toBeInTheDocument();
      expect(screen.getByText('Yêu cầu kỹ sư cung cấp tệp ảnh gốc')).toBeInTheDocument();
    });
  });
});


