import React, { useState, useEffect, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import PropTypes from 'prop-types';
import api from '../lib/api';

/**
 * Tìm ước chung lớn nhất (GCD) bằng thuật toán Euclid
 */
export function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Tính tỷ lệ khung hình tối giản từ chiều rộng và chiều cao
 * Ví dụ:
 * - 2880 × 2160 -> 4:3
 * - 1920 × 1080 -> 16:9
 * - 1080 × 1080 -> 1:1
 * - 2880 × 1800 -> 8:5
 */
export function calculateAspectRatio(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!w || !h || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
    return 'Không có dữ liệu';
  }
  const divisor = gcd(w, h);
  const rw = Math.round(w / divisor);
  const rh = Math.round(h / divisor);
  return `${rw}:${rh}`;
}

/**
 * Component hiển thị "Chi tiết ảnh" hiện trường (EXIF, thông tin tệp, kết quả kiểm tra)
 * Story S-40, S-41, S-42 / T-106, T-108, T-109, T-110
 *
 * Tiêu chí thiết kế:
 * - Tiêu đề: "Chi tiết ảnh" (ở góc trên bên trái).
 * - Nhãn trạng thái ở góc trên bên phải (Hợp lệ, Cần xác minh, Không hợp lệ, Không đủ dữ liệu, Lỗi kiểm tra, Chưa kiểm tra).
 * - Ảnh hiển thị lớn, rõ ràng, bo góc.
 * - Phần "Thông tin tệp": Tên ảnh, Định dạng, Tỷ lệ khung hình, Độ phân giải, Người tải lên, Thời gian tải lên, Mã đợt/công việc.
 * - Phần "Metadata EXIF": Thời gian chụp, Thiết bị chụp, Vị trí GPS, Phần mềm chỉnh sửa, ISO, Khẩu độ, Tốc độ màn trập.
 * - Phần "Chi tiết cảnh báo": Hiển thị dấu hiệu bất thường, lý do, độ tin cậy và hướng xử lý đối chiếu.
 * - Render qua createPortal vào document.body với z-[9999] để đảm bảo luôn mở trên cùng của mọi dialog.
 */
export default function PhotoMetadataPanel({
  projectId,
  photoId,
  photo = null,
  kind,
  isOpen,
  onClose,
  mode,
  onSwitchMode,
}) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [internalMode, setInternalMode] = useState('detail');
  const [naturalDimensions, setNaturalDimensions] = useState({ width: null, height: null });

  const currentMode = mode || internalMode;

  const fetchMetadata = useCallback(() => {
    if (!isOpen || !projectId || !photoId || !kind) {
      setMetadata(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    api
      .get(`/projects/${projectId}/photo-metadata/${kind}/${photoId}`)
      .then((res) => {
        setMetadata(res.data);
        setLoading(false);
      })
      .catch((err) => {
        // Ghi log lỗi phía client
        console.error('Lỗi khi tải thông tin ảnh:', err);
        const rawMsg = err.response?.data?.error || err.response?.data?.message;
        const errMsg =
          rawMsg &&
          !String(rawMsg).includes('Lỗi máy chủ') &&
          !String(rawMsg).includes('Lỗi kiểm tra')
            ? rawMsg
            : 'Không thể tải thông tin tệp. Vui lòng bấm thử lại.';
        setError(errMsg);
        setLoading(false);
      });
  }, [isOpen, projectId, photoId, kind]);

  // Khóa cuộn trang nền khi modal đang mở để tránh cuộn kép
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Đóng modal tức thì khi bấm phím Escape (bắt ở capture phase để ưu tiên xử lý)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      if (photo) {
        setMetadata({
          ...photo,
          inspection: photo.inspection || null,
        });
      }
      fetchMetadata();
    } else {
      setMetadata(null);
      setError(null);
      setInternalMode('detail');
      setNaturalDimensions({ width: null, height: null });
    }
  }, [isOpen, fetchMetadata, photo]);

  const handleImageClick = () => {
    if (onSwitchMode) {
      onSwitchMode('preview');
    } else {
      setInternalMode('preview');
    }
  };

  if (!isOpen) return null;

  // Format thời gian hiển thị theo giờ Việt Nam
  const formatDateTime = (isoString) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getTimeSourceLabel = (src) => {
    switch (src) {
      case 'exif_offset':
        return 'EXIF gốc (kèm múi giờ)';
      case 'gps_utc':
        return 'Đồng hồ vệ tinh GPS (UTC)';
      case 'assumed_local':
        return 'EXIF gốc (quy ước giờ Việt Nam)';
      case 'client_reported':
        return 'Thiết bị ghi nhận tại thời điểm gửi';
      default:
        return 'Không xác định';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return null;
    const b = Number(bytes);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFormatLabel = (mimeType, fileName) => {
    if (mimeType) {
      const m = mimeType.toLowerCase();
      if (m.includes('jpeg') || m.includes('jpg')) return 'JPEG';
      if (m.includes('png')) return 'PNG';
      if (m.includes('webp')) return 'WebP';
      if (m.includes('heic') || m.includes('heif')) return 'HEIC';
    }
    if (fileName) {
      const ext = fileName.split('.').pop()?.toUpperCase();
      if (ext) return ext;
    }
    return 'Không xác định';
  };

  // Dữ liệu hiển thị
  const inspection = metadata?.inspection || photo?.inspection;
  const techMeta = inspection?.metadata || {};
  const fileName = metadata?.file_name || photo?.file_name || 'Ảnh hiện trường';
  const fileSize = metadata?.file_size || photo?.file_size;
  const mimeType = metadata?.mime_type || photo?.mime_type;
  const uploaderName =
    metadata?.uploaded_by_name ||
    photo?.uploaded_by_name ||
    'Không có dữ liệu';
  const uploadTime = formatDateTime(metadata?.uploaded_at || photo?.created_at);
  const batchName = metadata?.batch_name || photo?.batch_name;
  const imageUrl = photo?.url || metadata?.url;

  // Độ phân giải và Tỷ lệ khung hình
  const width =
    techMeta.width ||
    metadata?.width ||
    photo?.width ||
    naturalDimensions.width ||
    null;
  const height =
    techMeta.height ||
    metadata?.height ||
    photo?.height ||
    naturalDimensions.height ||
    null;
  const resolution =
    width && height ? `${width} × ${height} px` : null;
  const aspectRatio = calculateAspectRatio(width, height);

  // Metadata EXIF
  const capturedAtFormatted = formatDateTime(
    metadata?.captured_at || techMeta.captured_at
  );
  const cameraDevice =
    techMeta.make || techMeta.model
      ? `${techMeta.make || ''} ${techMeta.model || ''}`.trim()
      : null;
  const software = techMeta.software || null;
  const iso = techMeta.iso ? `ISO ${techMeta.iso}` : null;
  const aperture = techMeta.aperture || null;
  const shutterSpeed = techMeta.shutter_speed || null;
  const fileHash = techMeta.file_hash || metadata?.file_hash || null;

  const warnings = Array.isArray(inspection?.warnings) ? inspection.warnings : [];
  const anomalyWarnings = warnings.filter(
    (w) =>
      w &&
      w.code !== 'MISSING_CAMERA_METADATA' &&
      w.code !== 'MISSING_CAPTURE_TIME' &&
      w.code !== 'MISSING_GPS'
  );

  // Xác định nhãn trạng thái góc trên bên phải theo đúng 3 trạng thái chuẩn (Story S-42 / Mục I.3)
  const getStatusPill = () => {
    if (loading) {
      return {
        label: 'Đang tải...',
        className: 'bg-slate-100 text-slate-600 border border-slate-200',
      };
    }

    const dataStatus =
      metadata?.data_status ||
      inspection?.data_status ||
      (metadata?.data_status_label === 'Dữ liệu đầy đủ' ? 'full_data' : null);

    if (dataStatus === 'full_data') {
      return {
        label: 'Dữ liệu đầy đủ',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      };
    }
    if (dataStatus === 'incomplete_data') {
      return {
        label: 'Dữ liệu không đầy đủ',
        className: 'bg-slate-100 text-slate-700 border border-slate-200',
      };
    }
    if (dataStatus === 'incomplete_data_warning') {
      return {
        label: 'Dữ liệu không đầy đủ và cảnh báo',
        className: 'bg-amber-50 text-amber-800 border border-amber-300',
      };
    }

    if (kind === 'acceptance') {
      return null;
    }

    // Fallback theo inspection.status cũ
    const legacyStatus = inspection?.status;
    if (legacyStatus === 'clean') {
      return {
        label: 'Dữ liệu đầy đủ',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      };
    }
    if (legacyStatus === 'warning') {
      return {
        label: 'Dữ liệu không đầy đủ và cảnh báo',
        className: 'bg-amber-50 text-amber-800 border border-amber-300',
      };
    }
    if (legacyStatus === 'incomplete_data' || metadata?.status === 'none') {
      return {
        label: 'Dữ liệu không đầy đủ',
        className: 'bg-slate-100 text-slate-700 border border-slate-200',
      };
    }
    if (legacyStatus === 'error' || metadata?.status === 'unreadable' || metadata?.status === 'unsupported') {
      return {
        label: 'Dữ liệu không đầy đủ và cảnh báo',
        className: 'bg-amber-50 text-amber-800 border border-amber-300',
      };
    }

    if (error) {
      return null;
    }

    return {
      label: 'Dữ liệu không đầy đủ',
      className: 'bg-slate-100 text-slate-700 border border-slate-200',
    };
  };

  const statusPill = getStatusPill();

  // Chế độ 1: PHÓNG TO ẢNH (Lightbox độc lập qua Radix DialogPrimitive)
  if (currentMode === 'preview') {
    return (
      <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-testid="preview-backdrop"
            className="fixed inset-0 z-[9999] pointer-events-auto bg-black/95 select-none"
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-3 sm:p-4 outline-none bg-transparent select-none"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <DialogPrimitive.Title className="sr-only">Phóng to ảnh hiện trường</DialogPrimitive.Title>
            <div
              className="relative max-h-[92vh] max-w-[95vw] flex items-center justify-center pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={fileName}
                  className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
                />
              ) : (
                <div className="text-white/70 text-sm">Không tìm thấy đường dẫn ảnh</div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                data-testid="close-preview-btn"
                className="absolute -top-3 -right-3 sm:top-2 sm:right-2 rounded-full bg-white/20 hover:bg-white/40 p-2 text-white transition cursor-pointer"
                aria-label="Đóng phóng to ảnh"
              >
                ✕
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  // Chế độ 2: CHI TIẾT ẢNH (EXIF, Thông tin tệp, Cảnh báo)
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[9999] pointer-events-auto bg-black/60"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-3 sm:p-4 overflow-hidden outline-none bg-transparent"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <div
            className="relative w-full max-w-lg max-h-[90dvh] sm:max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl transition-all border border-slate-200/80 overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hàng trên cùng cố định: Tiêu đề "Chi tiết ảnh", Nhãn trạng thái và Nút đóng */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0 bg-white">
              <DialogPrimitive.Title asChild>
                <h2
                  id="photo-metadata-title"
                  className="text-lg sm:text-xl font-bold tracking-tight text-slate-900"
                >
                  Chi tiết ảnh
                </h2>
              </DialogPrimitive.Title>
          <div className="flex items-center gap-2">
            {statusPill && (
              <span
                data-testid="inspection-status-badge"
                className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold ${statusPill.className}`}
              >
                {statusPill.label}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              data-testid="close-x-btn"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Vùng nội dung cuộn độc lập: hỗ trợ xem trọn vẹn thông tin tệp, EXIF, đối chiếu phạm vi và cảnh báo */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {/* Khối xem trước ảnh lớn */}
          <div className="relative w-full overflow-hidden rounded-xl bg-slate-900/5 border border-slate-100 group shrink-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={fileName}
                className="w-full max-h-[220px] sm:max-h-[280px] object-cover sm:object-contain mx-auto transition-transform cursor-pointer"
                onClick={handleImageClick}
                onLoad={(e) => {
                  if (e.target?.naturalWidth && e.target?.naturalHeight) {
                    setNaturalDimensions({
                      width: e.target.naturalWidth,
                      height: e.target.naturalHeight,
                    });
                  }
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="py-16 text-center text-slate-400 text-xs">
                Không có hình ảnh xem trước
              </div>
            )}

            {/* Nút bookmark trang trí góc trên phải ảnh */}
            <div className="absolute top-2.5 right-2.5 rounded-md bg-black/40 p-1.5 text-white/90 shadow-sm backdrop-blur-sm pointer-events-none">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            </div>
          </div>

          {loading && (
            <div className="py-4 text-center text-xs text-slate-500">
              Đang đọc siêu dữ liệu...
            </div>
          )}

          {/* MỤC 1: THÔNG TIN TỆP */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Thông tin tệp
            </h3>
            <div className="divide-y divide-slate-100 text-xs sm:text-sm">
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Tên ảnh</span>
                <span className="font-mono text-slate-900 font-medium text-right truncate max-w-[240px]">
                  {fileName}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Định dạng</span>
                <span className="text-slate-900 font-medium text-right">
                  {getFormatLabel(mimeType, fileName)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Độ phân giải</span>
                <span
                  data-testid="photo-resolution"
                  className="text-slate-900 font-medium text-right"
                >
                  {resolution || 'Không có dữ liệu'}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Tỷ lệ khung hình</span>
                <span
                  data-testid="photo-aspect-ratio"
                  className="text-slate-900 font-medium text-right font-mono"
                >
                  {aspectRatio}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Người tải lên</span>
                <span className="text-slate-900 font-medium text-right">
                  {uploaderName}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Thời gian tải lên</span>
                <span className="text-slate-900 font-medium text-right">
                  {uploadTime || 'Không có dữ liệu'}
                </span>
              </div>
              {batchName && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-slate-600">Mã đợt nghiệm thu</span>
                  <span className="text-slate-900 font-medium text-right">
                    {batchName}
                  </span>
                </div>
              )}
              {fileHash && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-slate-600">Mã băm SHA-256</span>
                  <span
                    className="font-mono text-[11px] text-slate-800 text-right truncate max-w-[180px] sm:max-w-[240px]"
                    title={fileHash}
                  >
                    {fileHash.slice(0, 16)}...
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* MỤC 2: METADATA EXIF */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1 mt-4">
              Metadata EXIF
            </h3>
            <div className="divide-y divide-slate-100 text-xs sm:text-sm">
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Thời gian chụp</span>
                <div className="text-right">
                  {capturedAtFormatted ? (
                    <div>
                      <span
                        data-testid="captured-at-text"
                        className="text-slate-900 font-medium"
                      >
                        {capturedAtFormatted}
                      </span>
                      {metadata?.captured_at_source && (
                        <span className="text-[11px] text-slate-500 block">
                          Nguồn: {getTimeSourceLabel(metadata.captured_at_source)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-900 font-medium">
                      Không có dữ liệu
                    </span>
                  )}
                </div>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Thiết bị chụp</span>
                <span className="text-slate-900 font-medium text-right">
                  {cameraDevice || 'Không có dữ liệu'}
                </span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Vị trí GPS</span>
                <div className="text-right">
                  {metadata?.has_gps && (
                    <p className="text-xs font-medium mb-1 text-slate-700 text-right" data-testid="gps-source-text">
                      {metadata.gps_source === 'client_reported' || metadata.source === 'client'
                        ? 'Toạ độ do thiết bị báo, chưa xác thực từ ảnh gốc'
                        : 'Toạ độ từ ảnh gốc'}
                    </p>
                  )}
                  {metadata?.gps ? (
                    <div data-testid="gps-coordinates-section" className="space-y-0.5">
                      <div>
                        Vĩ độ: <span className="font-mono font-medium text-slate-900">{metadata.gps.latitude.toFixed(6)}</span>
                        {', '}
                        Kinh độ: <span className="font-mono font-medium text-slate-900">{metadata.gps.longitude.toFixed(6)}</span>
                      </div>
                      {metadata.gps.accuracy_m !== null && (
                        <span className="text-[11px] text-slate-500 block">
                          ±{metadata.gps.accuracy_m} m
                        </span>
                      )}
                      <div>
                        <a
                          href={`https://www.google.com/maps?q=${metadata.gps.latitude},${metadata.gps.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          📍 Xem trên bản đồ (Google Maps) ↗
                        </a>
                      </div>
                    </div>
                  ) : metadata?.has_gps ? (
                    <div
                      data-testid="gps-restricted-section"
                      className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200 text-left max-w-[280px]"
                    >
                      <p className="font-medium">Đã ghi nhận toạ độ hiện trường</p>
                      <p className="mt-0.5 text-amber-700 text-[11px]">
                        Để bảo vệ quyền riêng tư vị trí của người lao động, chỉ Ban quản lý và Chủ đầu tư mới được xem toạ độ chi tiết.
                      </p>
                    </div>
                  ) : (
                    <span className="text-slate-900 font-medium">
                      Không có dữ liệu
                    </span>
                  )}
                </div>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Phần mềm chỉnh sửa</span>
                <span className="text-slate-900 font-medium text-right">
                  {software || 'Không có dữ liệu'}
                </span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">ISO</span>
                <span className="text-slate-900 font-medium text-right">
                  {iso || 'Không có dữ liệu'}
                </span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Khẩu độ</span>
                <span className="text-slate-900 font-medium text-right">
                  {aperture || 'Không có dữ liệu'}
                </span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-600">Tốc độ màn trập</span>
                <span className="text-slate-900 font-medium text-right">
                  {shutterSpeed || 'Không có dữ liệu'}
                </span>
              </div>
            </div>
          </div>

          {/* MỤC 3: CHI TIẾT CẢNH BÁO QUY TẮC BẰNG CHỨNG (S-42 / T-110) */}
          <div data-testid="photo-inspection-section" className="pt-1">
            {warnings.length > 0 && (
              <div
                data-testid="inspection-warnings-section"
                className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3"
              >
                <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <span>⚠️</span> Dấu hiệu cảnh báo bất thường ({warnings.length})
                </div>
                <div
                  data-testid="inspection-warnings-list"
                  className="space-y-2 text-xs"
                >
                  {warnings.map((w, idx) => (
                    <div
                      key={w.code || idx}
                      data-testid={`inspection-warning-${w.code || idx}`}
                      className="rounded-lg bg-white/80 p-2.5 border border-amber-200/80 space-y-1"
                    >
                      <div className="font-semibold text-amber-950 flex items-center justify-between">
                        <span>{w.title}</span>
                        <span className="text-[10px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          {w.severity === 'high'
                            ? 'Nghi vấn cao'
                            : w.severity === 'medium'
                            ? 'Cần kiểm tra'
                            : 'Lưu ý'}
                        </span>
                      </div>
                      <p className="text-slate-700 text-[11px] leading-relaxed">
                        {w.reason}
                      </p>
                      {w.actual_value && (
                        <div className="mt-1 rounded bg-slate-50 border border-slate-200/60 p-1.5 text-[11px] text-slate-700 space-y-0.5">
                          <div>
                            <span className="font-semibold text-slate-600">Thực tế: </span>
                            <span className="font-mono text-slate-900">{w.actual_value}</span>
                          </div>
                          {w.comparison_value && (
                            <div>
                              <span className="font-semibold text-slate-600">Đối chiếu: </span>
                              <span className="text-slate-800">{w.comparison_value}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {w.action_suggestion && (
                        <div className="text-[10px] text-amber-900 mt-0.5">
                          <span className="font-semibold">Đề xuất: </span>{w.action_suggestion}
                        </div>
                      )}
                      {w.confidence && (
                        <div className="text-[10px] text-amber-800">
                          Độ tin cậy dấu hiệu: {w.confidence === 'high' ? 'Cao' : 'Trung bình'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-amber-800/90 italic pt-1">
                  💡 Hướng xử lý: Đối chiếu hiện trường thực tế, không tự động kết luận gian lận và không tự ý chặn duyệt phiếu.
                </p>
              </div>
            )}

            {/* Dữ liệu đầy đủ */}
            {(statusPill?.label === 'Dữ liệu đầy đủ' || inspection?.status === 'clean') && warnings.length === 0 && (
              <div
                data-testid="inspection-clean-state"
                className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 space-y-1"
              >
                <div className="font-semibold flex items-center gap-1 text-emerald-800">
                  <span>✓</span> Dữ liệu đầy đủ
                </div>
                <p className="text-emerald-700 text-[11px]">
                  Tệp ảnh có đầy đủ thông tin thời gian chụp gốc và thiết bị. Không phát hiện dấu hiệu bất thường.
                </p>
              </div>
            )}

            {/* Dữ liệu không đầy đủ (không có cảnh báo) */}
            {statusPill?.label === 'Dữ liệu không đầy đủ' && warnings.length === 0 && (
              <div
                data-testid="inspection-incomplete-state"
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 space-y-1"
              >
                <div className="font-semibold text-slate-900">
                  ℹ️ Dữ liệu không đầy đủ
                </div>
                <p className="text-slate-600 text-[11px]">
                  Tệp ảnh thiếu một số trường EXIF bắt buộc (thời gian chụp hoặc thiết bị).
                </p>
              </div>
            )}
          </div>

          {/* Test ID compatibility: metadata-status-badge, inspection-metadata-details */}
          <div className="hidden">
            <span data-testid="metadata-status-badge">
              {metadata?.status_label || metadata?.status || 'none'}
            </span>
            <div data-testid="inspection-metadata-details">
              <span>{techMeta.aspect_ratio || ''}</span>
            </div>
          </div>
        </div>

        {/* Hàng dưới cùng cố định */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
          <span className="text-[11px] text-slate-500">
            {imageUrl ? 'Bấm vào ảnh để phóng to' : ''}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="close-panel-btn"
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

PhotoMetadataPanel.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  photoId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  photo: PropTypes.object,
  kind: PropTypes.oneOf(['diary', 'acceptance']).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(['detail', 'preview']),
  onSwitchMode: PropTypes.func,
};
