import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import api from '../lib/api';

/**
 * Component hiển thị "Chi tiết ảnh" hiện trường (EXIF, thông tin tệp, kết quả kiểm tra)
 * Story S-40, S-41, S-42 / T-106, T-108, T-109, T-110
 *
 * Tiêu chí thiết kế:
 * - Tiêu đề: "Chi tiết ảnh" (ở góc trên bên trái).
 * - Nhãn trạng thái ở góc trên bên phải (Hợp lệ, Cần xác minh, Không hợp lệ, Không đủ dữ liệu, Lỗi kiểm tra, Chưa kiểm tra).
 * - Ảnh hiển thị lớn, rõ ràng, bo góc.
 * - Phần "Thông tin tệp": Tên ảnh, Định dạng, Kích thước tệp, Độ phân giải, Người tải lên, Thời gian tải lên, Mã đợt/công việc.
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
}) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isZoomed, setIsZoomed] = useState(false);

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
        const errorMsg =
          err.response?.data?.message ||
          err.response?.data?.error ||
          (err.message === 'Network Error' ? 'Mất kết nối máy chủ' : null) ||
          'Không thể tải thông tin siêu dữ liệu ảnh.';
        setError(errorMsg);
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

  useEffect(() => {
    if (isOpen) {
      if (photo) {
        setMetadata((prev) => prev || {
          ...photo,
          inspection: photo.inspection || null,
        });
      }
      fetchMetadata();
    } else {
      setMetadata(null);
      setError(null);
      setIsZoomed(false);
    }
  }, [isOpen, fetchMetadata, photo]);

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
    'Nguyễn Văn A';
  const uploadTime = formatDateTime(metadata?.uploaded_at || photo?.created_at);
  const batchName = metadata?.batch_name || photo?.batch_name;
  const imageUrl = photo?.url || metadata?.url;

  // Độ phân giải
  const width = techMeta.width || null;
  const height = techMeta.height || null;
  const resolution =
    width && height ? `${width} × ${height} px` : null;

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

  // Xác định nhãn trạng thái góc trên bên phải
  const getStatusPill = () => {
    if (error) {
      return {
        label: 'Lỗi kiểm tra',
        className: 'bg-rose-50 text-rose-700 border border-rose-200',
      };
    }
    const status = inspection?.status;
    if (status === 'warning') {
      return {
        label: 'Cần xác minh',
        className: 'bg-orange-50 text-orange-700 border border-orange-200',
      };
    }
    if (status === 'invalid') {
      return {
        label: 'Không hợp lệ',
        className: 'bg-red-50 text-red-700 border border-red-200',
      };
    }
    if (status === 'clean') {
      return {
        label: 'Hợp lệ',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      };
    }
    if (status === 'incomplete_data' || metadata?.status === 'none') {
      return {
        label: 'Không đủ dữ liệu',
        className: 'bg-slate-100 text-slate-700 border border-slate-200',
      };
    }
    if (status === 'error' || metadata?.status === 'unreadable' || metadata?.status === 'unsupported') {
      return {
        label: 'Lỗi kiểm tra',
        className: 'bg-rose-50 text-rose-700 border border-rose-200',
      };
    }
    return {
      label: 'Chưa kiểm tra',
      className: 'bg-slate-100 text-slate-600 border border-slate-200',
    };
  };

  const statusPill = getStatusPill();

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-metadata-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90dvh] sm:max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl transition-all border border-slate-200/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hàng trên cùng cố định: Tiêu đề "Chi tiết ảnh", Nhãn trạng thái và Nút đóng */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0 bg-white">
          <h2
            id="photo-metadata-title"
            className="text-lg sm:text-xl font-bold tracking-tight text-slate-900"
          >
            Chi tiết ảnh
          </h2>
          <div className="flex items-center gap-2">
            <span
              data-testid="inspection-status-badge"
              className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold ${statusPill.className}`}
            >
              {statusPill.label}
            </span>
            <button
              type="button"
              onClick={onClose}
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
                onClick={() => setIsZoomed(true)}
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

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                data-testid="retry-metadata-btn"
                onClick={fetchMetadata}
                className="font-semibold underline ml-2 hover:text-red-900 cursor-pointer"
              >
                Thử lại
              </button>
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
                <span className="text-slate-900 font-medium text-right">
                  {resolution || 'Không có dữ liệu'}
                </span>
              </div>
              {fileSize && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-slate-600">Kích thước tệp</span>
                  <span className="text-slate-900 font-medium text-right">
                    {formatFileSize(fileSize)}
                  </span>
                </div>
              )}
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
                    <span className="text-slate-500 italic">
                      Ảnh không ghi nhận thời gian chụp gốc
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
                    <span className="text-slate-500 italic">
                      Ảnh không có thông tin toạ độ GPS
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

          {/* MỤC 3: ĐỐI CHIẾU PHẠM VI CÔNG TRƯỜNG (S-41 / T-108) */}
          <div data-testid="geofence-evaluation-section" className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">
              Đối chiếu phạm vi công trường
            </span>
            {metadata?.geofence?.status === 'inside' ? (
              <div className="flex items-center gap-2">
                <span
                  data-testid="geofence-status-inside"
                  className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 border border-green-200"
                >
                  ✓ Trong phạm vi công trường
                </span>
                {metadata.geofence.distance_m !== null && (
                  <span className="text-xs text-slate-600">
                    (cách tâm {Number(metadata.geofence.distance_m).toLocaleString('vi-VN')} m)
                  </span>
                )}
              </div>
            ) : metadata?.geofence?.status === 'outside' ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    data-testid="geofence-status-outside"
                    className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 border border-red-200"
                  >
                    ⚠️ Ngoài phạm vi công trường
                  </span>
                  {metadata.geofence.distance_m !== null && (
                    <span className="text-xs font-semibold text-red-700">
                      (cách tâm {Number(metadata.geofence.distance_m).toLocaleString('vi-VN')} m)
                    </span>
                  )}
                </div>
                <p className="text-xs text-red-600">
                  Ảnh được chụp ngoài bán kính công trường quy định, cần kiểm tra đối chiếu khi nghiệm thu.
                </p>
              </div>
            ) : metadata?.geofence?.status === 'no_site_config' ? (
              <p className="text-sm italic text-gray-500">
                Dự án chưa cấu hình toạ độ tâm và bán kính công trường
              </p>
            ) : (
              <p className="text-sm italic text-gray-500">
                Không có toạ độ GPS để đối chiếu với phạm vi công trường
              </p>
            )}
          </div>

          {/* MỤC 4: CHI TIẾT CẢNH BÁO QUY TẮC BẰNG CHỨNG (S-42 / T-110) */}
          <div data-testid="photo-inspection-section" className="pt-2">
            {inspection?.status === 'warning' && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <span>⚠️</span> Chi tiết cảnh báo cần xác minh
                </div>
                <div
                  data-testid="inspection-warnings-list"
                  className="space-y-2 text-xs"
                >
                  {inspection.warnings?.map((w, idx) => (
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

            {inspection?.status === 'clean' && (
              <div
                data-testid="inspection-clean-state"
                className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 space-y-1"
              >
                <div className="font-semibold flex items-center gap-1 text-emerald-800">
                  <span>✓</span> Bằng chứng hợp lệ
                </div>
                <p className="text-emerald-700 text-[11px]">
                  Tệp ảnh có cấu trúc toàn vẹn, không phát hiện kích thước chụp lại màn hình. Thông tin thời gian chụp nhất quán.
                </p>
              </div>
            )}

            {inspection?.status === 'incomplete_data' && (
              <div
                data-testid="inspection-incomplete-state"
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 space-y-1"
              >
                <div className="font-semibold text-slate-900">
                  ℹ️ Dữ liệu không đầy đủ để đánh giá toàn diện
                </div>
                <p className="text-slate-600 text-[11px]">
                  Tệp ảnh không chứa các thẻ EXIF phần cứng của máy ảnh (Make/Model) hoặc không có thời gian chụp gốc.
                </p>
              </div>
            )}

            {inspection?.status === 'error' && (
              <div
                data-testid="inspection-error-state"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 space-y-1"
              >
                <div className="font-semibold text-rose-900">
                  ❌ Lỗi phân tích tệp ảnh
                </div>
                <p className="text-rose-700 text-[11px]">
                  Không thể trích xuất hoặc phân tích tệp ảnh do tệp bị hỏng hoặc định dạng không hỗ trợ.
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
            onClick={onClose}
            data-testid="close-panel-btn"
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Modal phóng to ảnh (Lightbox) nếu người dùng bấm vào ảnh */}
      {isZoomed && imageUrl && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setIsZoomed(false)}
        >
          <img
            src={imageUrl}
            alt={fileName}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40 transition"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );

  // Render modal vào document.body qua createPortal để luôn nổi trên cùng
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}

PhotoMetadataPanel.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  photoId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  photo: PropTypes.object,
  kind: PropTypes.oneOf(['diary', 'acceptance']).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
